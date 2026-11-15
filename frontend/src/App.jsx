import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

const API = `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}`;
const navItems = [
  ["dashboard", "▦", "Overview", ["ADMIN", "TEACHER", "GUARDIAN", "STUDENT"]],
  ["students", "♙", "Students", ["ADMIN", "TEACHER", "GUARDIAN", "STUDENT"]],
  ["teachers", "♟", "Teachers", ["ADMIN"]],
  ["guardians", "♡", "Guardians", ["ADMIN"]],
  ["classes", "▤", "Classes", ["ADMIN", "TEACHER"]],
  ["subjects", "◈", "Subjects", ["ADMIN", "TEACHER"]],
  ["attendance", "✓", "Attendance", ["ADMIN", "TEACHER", "GUARDIAN", "STUDENT"]],
  ["exams", "✎", "Examinations", ["ADMIN", "TEACHER", "GUARDIAN", "STUDENT"]],
  ["fees", "₹", "Fee ledger", ["ADMIN", "GUARDIAN", "STUDENT"]],
  ["report-card", "▤", "Report cards", ["ADMIN", "TEACHER", "GUARDIAN", "STUDENT"]],
  ["reports", "▥", "Reports & audit", ["ADMIN", "TEACHER"]]
];

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const today = () => dateKey(new Date());
const emptyStudent = { admissionNo: "", firstName: "", lastName: "", gender: "", classId: "", sectionId: "" };
const emptyTeacher = { fullName: "", email: "", password: "", employeeNo: "", phone: "" };
const emptyGuardian = { fullName: "", email: "", password: "", phone: "", studentId: "", relation: "Parent" };
const emptySubject = { code: "", name: "" };
const emptyAssignment = { classId: "", sectionId: "", subjectId: "", teacherId: "" };
const emptyExam = { title: "", classId: "", sectionId: "", subjectId: "", examDate: today(), maxMarks: "100", passMarks: "35" };
const emptyInvoice = { studentId: "", description: "", amount: "", dueDate: today() };

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("school-token") || "");
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("school-user") || "null"); } catch { return null; }
  });
  const [page, setPage] = useState("dashboard");
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [guardians, setGuardians] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [attendanceFilterDate, setAttendanceFilterDate] = useState(today());
  const [attendanceFilterClass, setAttendanceFilterClass] = useState("");
  const [attendanceFilterStudent, setAttendanceFilterStudent] = useState("");
  const [exams, setExams] = useState([]);
  const [fees, setFees] = useState([]);
  const [report, setReport] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [reportCard, setReportCard] = useState(null);
  const [selectedReportStudent, setSelectedReportStudent] = useState("");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [registration, setRegistration] = useState({ fullName: "", email: "", phone: "", password: "", role: "GUARDIAN" });
  const [authNotice, setAuthNotice] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [teacherForm, setTeacherForm] = useState(emptyTeacher);
  const [guardianForm, setGuardianForm] = useState(emptyGuardian);
  const [guardianLinkForm, setGuardianLinkForm] = useState({ guardianId: "", studentId: "", relation: "Parent" });
  const [studentAccountLinkForm, setStudentAccountLinkForm] = useState({ studentId: "", userId: "" });
  const [unlinkedStudentAccounts, setUnlinkedStudentAccounts] = useState([]);
  const [accountRequests, setAccountRequests] = useState([]);
  const [className, setClassName] = useState("");
  const [sectionForm, setSectionForm] = useState({ classId: "", name: "" });
  const [teacherAssignment, setTeacherAssignment] = useState({ classId: "", sectionId: "", teacherId: "" });
  const [subjectForm, setSubjectForm] = useState(emptySubject);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignment);
  const [attendanceForm, setAttendanceForm] = useState({ studentId: "", date: today(), session: "MORNING", status: "PRESENT" });
  const [examForm, setExamForm] = useState(emptyExam);
  const [resultForm, setResultForm] = useState({ examId: "", studentId: "", marks: "" });
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoice);
  const [search, setSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const role = user?.role || "";
  const visibleNav = navItems.filter(item => item[3].includes(role));
  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter(student => !query || [
      student.admissionNo, student.firstName, student.lastName,
      student.schoolClass?.name, student.section?.name
    ].some(value => String(value || "").toLowerCase().includes(query)));
  }, [students, search]);
  const pageSize = 8;
  const studentPages = Math.max(1, Math.ceil(visibleStudents.length / pageSize));
  const pagedStudents = visibleStudents.slice((studentPage - 1) * pageSize, studentPage * pageSize);
  const visibleAttendance = attendance.filter(item =>
    (!attendanceFilterDate || String(item.date).slice(0, 10) === attendanceFilterDate) &&
    (!attendanceFilterClass || item.student?.classId === attendanceFilterClass) &&
    (!attendanceFilterStudent || item.studentId === attendanceFilterStudent)
  );
  const attendancePresent = visibleAttendance.filter(item => item.status === "PRESENT").length;
  const attendanceAbsent = visibleAttendance.filter(item => item.status === "ABSENT").length;
  const attendanceLate = visibleAttendance.filter(item => item.status === "LATE").length;

  const request = useCallback(async (path, options = {}, authToken = token) => {
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.message || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return result;
  }, [token]);

  const loadAll = useCallback(async (activeRole = role, activeToken = token) => {
    if (!activeToken || !activeRole) return;
    setLoading(true);
    setError("");
    try {
      const endpoints = [
        ["students", "/students"],
        ["attendance", "/attendance"],
        ["exams", "/exams"]
      ];
      if (["ADMIN", "TEACHER"].includes(activeRole)) {
        endpoints.push(["classes", "/classes"], ["subjects", "/subjects"], ["report", "/reports/summary"]);
      }
      if (activeRole === "ADMIN") {
        endpoints.push(
          ["teachers", "/teachers"], ["guardians", "/guardians"], ["fees", "/fees"],
          ["audit", "/reports/audit"], ["accountRequests", "/auth/requests"],
          ["unlinkedStudentAccounts", "/auth/unlinked-students"]
        );
      } else if (["GUARDIAN", "STUDENT"].includes(activeRole)) {
        endpoints.push(["fees", "/fees"]);
      }
      const results = await Promise.all(endpoints.map(async ([key, path]) => [key, await request(path, {}, activeToken)]));
      const setters = {
        students: setStudents, teachers: setTeachers, guardians: setGuardians,
        classes: setClasses, subjects: setSubjects, attendance: setAttendance,
        exams: setExams, fees: setFees, report: result => setReport(result.data),
        audit: result => setAuditLogs(result.data || []),
        accountRequests: result => setAccountRequests(result.data || []),
        unlinkedStudentAccounts: result => setUnlinkedStudentAccounts(result.data || [])
      };
      results.forEach(([key, result]) => setters[key]?.(result.data || []));
    } catch (loadError) {
      setError(`${loadError.message} Refresh or sign in again.`);
    } finally {
      setLoading(false);
    }
  }, [role, request, token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    request("/auth/me", {}, token)
      .then(result => {
        if (!active) return;
        setUser(result.data);
        localStorage.setItem("school-user", JSON.stringify(result.data));
        loadAll(result.data.role, token);
      })
      .catch(() => {
        if (active) {
          localStorage.removeItem("school-token");
          localStorage.removeItem("school-user");
          setToken("");
          setUser(null);
        }
      });
    return () => { active = false; };
  }, [loadAll, request, token]);

  function signOut() {
    localStorage.removeItem("school-token");
    localStorage.removeItem("school-user");
    setToken("");
    setUser(null);
    setStudents([]);
    setTeachers([]);
    setGuardians([]);
    setClasses([]);
    setSubjects([]);
    setAttendance([]);
    setAttendanceFilterClass("");
    setAttendanceFilterStudent("");
    setAttendanceFilterDate(today());
    setExams([]);
    setFees([]);
    setReport(null);
    setAuditLogs([]);
    setReportCard(null);
    setError("");
    setMessage("");
    setPage("dashboard");
  }

  function notify(text) {
    setMessage(text);
    setError("");
    window.setTimeout(() => setMessage(""), 3500);
  }

  async function withSubmit(action, successText) {
    setSubmitting(true);
    setError("");
    try {
      await action();
      await loadAll();
      notify(successText);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function signIn(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setAuthNotice("");
    try {
      const result = await request("/auth/login", { method: "POST", body: JSON.stringify(login) }, "");
      localStorage.setItem("school-token", result.token);
      localStorage.setItem("school-user", JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
      setPage("dashboard");
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function register(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setAuthNotice("");
    try {
      const result = await request("/auth/register", {
        method: "POST",
        body: JSON.stringify(registration)
      }, "");
      if (result.pendingApproval) {
        setAuthMode("login");
        setLogin({ email: registration.email, password: "" });
        setRegistration({ fullName: "", email: "", phone: "", password: "", role: "GUARDIAN" });
        setAuthNotice(result.message);
        return;
      }
      localStorage.setItem("school-token", result.token);
      localStorage.setItem("school-user", JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
      setPage("dashboard");
      setRegistration({ fullName: "", email: "", phone: "", password: "", role: "GUARDIAN" });
      setMessage(result.message);
    } catch (registrationError) {
      if (registrationError.status === 409) {
        setLogin({ email: registration.email, password: "" });
        setRegistration({ fullName: "", email: "", phone: "", password: "", role: "GUARDIAN" });
        setAuthMode("login");
        setAuthNotice("An account already uses this email. Enter your password to sign in.");
      } else {
        setError(registrationError.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function createStudent(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request("/students", { method: "POST", body: JSON.stringify(studentForm) });
      setStudentForm(emptyStudent);
    }, "Student record created.");
  }

  async function createTeacher(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request("/teachers", { method: "POST", body: JSON.stringify(teacherForm) });
      setTeacherForm(emptyTeacher);
    }, "Teacher account created.");
  }

  async function createGuardian(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request("/guardians", { method: "POST", body: JSON.stringify(guardianForm) });
      setGuardianForm(emptyGuardian);
    }, "Guardian account linked to the student.");
  }

  async function linkGuardianStudent(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request(`/guardians/${guardianLinkForm.guardianId}/students`, {
        method: "POST",
        body: JSON.stringify({ studentId: guardianLinkForm.studentId, relation: guardianLinkForm.relation })
      });
      setGuardianLinkForm({ guardianId: "", studentId: "", relation: "Parent" });
    }, "Student linked to guardian account.");
  }

  async function linkStudentAccount(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request(`/students/${studentAccountLinkForm.studentId}/account`, {
        method: "POST",
        body: JSON.stringify({ userId: studentAccountLinkForm.userId })
      });
      setStudentAccountLinkForm({ studentId: "", userId: "" });
    }, "Student login linked successfully.");
  }

  async function approveAccountRequest(userId) {
    await withSubmit(
      () => request(`/auth/requests/${userId}/approve`, { method: "POST", body: JSON.stringify({}) }),
      "Account request approved."
    );
  }

  async function rejectAccountRequest(userId) {
    await withSubmit(
      () => request(`/auth/requests/${userId}/reject`, { method: "POST", body: JSON.stringify({}) }),
      "Account request rejected."
    );
  }

  async function createClass(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request("/classes", { method: "POST", body: JSON.stringify({ name: className }) });
      setClassName("");
    }, "Class created.");
  }

  async function createSection(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request(`/classes/${sectionForm.classId}/sections`, {
        method: "POST", body: JSON.stringify({ name: sectionForm.name })
      });
      setSectionForm({ classId: "", name: "" });
    }, "Section created.");
  }

  async function assignTeacher(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request(`/classes/${teacherAssignment.classId}/sections/${teacherAssignment.sectionId}/teachers`, {
        method: "POST", body: JSON.stringify({ teacherId: teacherAssignment.teacherId })
      });
      setTeacherAssignment({ classId: "", sectionId: "", teacherId: "" });
    }, "Teacher assigned to section.");
  }

  async function createSubject(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request("/subjects", { method: "POST", body: JSON.stringify(subjectForm) });
      setSubjectForm(emptySubject);
    }, "Subject created.");
  }

  async function assignSubject(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request("/subjects/assignments", {
        method: "POST", body: JSON.stringify(assignmentForm)
      });
      setAssignmentForm(emptyAssignment);
    }, "Subject assigned to the class section.");
  }

  async function markAttendance(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request("/attendance", { method: "POST", body: JSON.stringify(attendanceForm) });
    }, "Attendance recorded. A duplicate student/session is rejected.");
  }

  async function createExam(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request("/exams", {
        method: "POST",
        body: JSON.stringify({ ...examForm, maxMarks: Number(examForm.maxMarks), passMarks: Number(examForm.passMarks) })
      });
      setExamForm(emptyExam);
    }, "Examination created.");
  }

  async function saveResult(event) {
    event.preventDefault();
    await withSubmit(async () => {
      await request(`/exams/${resultForm.examId}/results`, {
        method: "POST", body: JSON.stringify({ studentId: resultForm.studentId, marks: Number(resultForm.marks) })
      });
      setResultForm({ ...resultForm, marks: "" });
    }, "Exam result saved and grade calculated.");
  }

  async function createInvoice(event) {
    event.preventDefault();
    const amountCents = Math.round(Number(invoiceForm.amount) * 100);
    await withSubmit(async () => {
      await request("/fees", {
        method: "POST",
        body: JSON.stringify({ ...invoiceForm, amountCents })
      });
      setInvoiceForm(emptyInvoice);
    }, "Fee invoice issued.");
  }

  async function payInvoice(invoice) {
    const remaining = Number(window.prompt(`Simulated payment amount (₹). Balance: ${formatMoney(invoice.dueCents)}`, (invoice.dueCents / 100).toFixed(2)));
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const amountCents = Math.round(remaining * 100);
    await withSubmit(async () => {
      await request(`/fees/${invoice.id}/payments`, {
        method: "POST",
        headers: { "Idempotency-Key": window.crypto.randomUUID() },
        body: JSON.stringify({ amountCents })
      });
    }, "Simulated payment recorded.");
  }

  async function loadReportCard(studentId) {
    if (!studentId) {
      setReportCard(null);
      return;
    }
    setError("");
    try {
      const result = await request(`/exams/students/${studentId}/report-card`);
      setReportCard(result.data);
    } catch (reportError) {
      setReportCard(null);
      setError(reportError.message);
    }
  }

  if (!token || !user) {
    return (
      <div className="auth-page">
        <div className="auth-visual">
          <div className="auth-brand"><span className="brand-mark">B</span><span>BrightPath <b>School</b></span></div>
          <div className="visual-copy">
            <span className="eyebrow">SCHOOL OPERATIONS, SIMPLIFIED</span>
            <h1>Every student.<br />Every moment.<br /><em>In good hands.</em></h1>
            <p>A connected school workspace for academic teams, teachers and families.</p>
          </div>
          <div className="visual-footer"><span>LEARNING · CARE · COMMUNITY</span><span>01 — 04</span></div>
        </div>
        <main className="login-panel">
          <div className="mobile-brand"><span className="brand-mark">B</span> BrightPath School</div>
          <div className="login-content">
            <span className="eyebrow">{authMode === "login" ? "WELCOME BACK" : "JOIN BRIGHTPATH"}</span>
            <h2>{authMode === "login" ? "Sign in to your portal" : "Create your account"}</h2>
            <p className="muted">{authMode === "login" ? "Use your school account to continue." : "Choose the account type that fits you."}</p>
            {error && <div className="alert error" role="alert">{error}</div>}
            {authNotice && authMode === "login" && <div className="alert success" role="status">{authNotice}</div>}
            {authMode === "login" ? (
              <form className="stack-form login-form" onSubmit={signIn}>
                <Field label="Email address"><input type="email" autoComplete="username" required value={login.email} onChange={event => setLogin({ ...login, email: event.target.value })} /></Field>
                <Field label="Password"><input type="password" autoComplete="current-password" required value={login.password} onChange={event => setLogin({ ...login, password: event.target.value })} /></Field>
                <button className="primary-btn wide" disabled={submitting}>{submitting ? "Signing in..." : "Sign in"} <span>→</span></button>
              </form>
            ) : (
              <form className="stack-form login-form" onSubmit={register}>
                <Field label="Full name"><input autoComplete="name" required maxLength={120} value={registration.fullName} onChange={event => setRegistration({ ...registration, fullName: event.target.value })} /></Field>
                <Field label="Email address"><input type="email" autoComplete="email" required value={registration.email} onChange={event => setRegistration({ ...registration, email: event.target.value })} /></Field>
                <Field label="Account type"><select required value={registration.role} onChange={event => setRegistration({ ...registration, role: event.target.value })}><option value="GUARDIAN">Guardian / Parent</option><option value="STUDENT">Student</option><option value="TEACHER">Teacher</option><option value="ADMIN">Administrator</option></select></Field>
                <Field label="Phone (optional)"><input type="tel" autoComplete="tel" maxLength={30} value={registration.phone} onChange={event => setRegistration({ ...registration, phone: event.target.value })} /></Field>
                <Field label="Password (at least 8 characters)"><input type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={registration.password} onChange={event => setRegistration({ ...registration, password: event.target.value })} /></Field>
                <button className="primary-btn wide" disabled={submitting}>{submitting ? "Creating account..." : "Create account"} <span>→</span></button>
              </form>
            )}
            <div className="auth-mode-switch" role="group" aria-label="Account access">
              <button className={authMode === "login" ? "active" : ""} type="button" onClick={() => { setAuthMode("login"); setError(""); setAuthNotice(""); }}>Sign in</button>
              <button className={authMode === "register" ? "active" : ""} type="button" onClick={() => { setAuthMode("register"); setError(""); setAuthNotice(""); }}>Create account</button>
            </div>
            {authMode === "register" && <p className="privacy-note">{registration.role === "GUARDIAN" ? "The school must link your student before records become visible." : registration.role === "STUDENT" ? "The school must link your student record before records become visible." : registration.role === "TEACHER" ? "You can sign in right away. The school must assign your classes before school data is available." : "Administrator accounts can access school-wide records; use this role only for authorized staff."}</p>}
            {authMode === "login" && <p className="privacy-note">Secure access · Synthetic demo data only</p>}
          </div>
        </main>
      </div>
    );
  }

  const currentPage = navItems.find(item => item[0] === page) || navItems[0];
  const pageHeading = {
    dashboard: ["School overview", "A live snapshot of today's school operations."],
    students: ["Students", role === "GUARDIAN" || role === "STUDENT" ? "Student records available to your account." : "Manage enrolment and class placement."],
    teachers: ["Teaching team", "Staff accounts and academic responsibilities."],
    guardians: ["Guardians", "Create secure family access linked to a student."],
    classes: ["Classes & sections", "Organise learning groups and their teachers."],
    subjects: ["Subjects", "Manage the subjects taught in each section."],
    attendance: ["Attendance", "Record and review attendance by date and session."],
    exams: ["Examinations", "Create assessments and record marks with automatic grades."],
    fees: ["Fee ledger", "Invoices and simulated payments reconcile through a ledger."],
    "report-card": ["Report cards", "View exam scores and calculated academic summaries."],
    reports: ["Reports & audit", "Operational totals and a traceable business activity log."]
  }[page] || ["School overview", ""];

  const sectionsFor = classId => classes.find(item => item.id === classId)?.sections || [];
  const teacherSections = sectionsFor(teacherAssignment.classId);
  const examSections = sectionsFor(examForm.classId);
  const examSubjects = subjects.filter(subject =>
    (subject.classAssignments || []).some(assignment =>
      assignment.classId === examForm.classId &&
      (!examForm.sectionId || assignment.sectionId === examForm.sectionId)
    )
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">B</span><span>BrightPath <small>SCHOOL</small></span></div>
        <div className="school-term"><span className="school-symbol">✦</span><span><b>BrightPath School</b><small>Academic year 2026–27</small></span></div>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {visibleNav.map(([id, icon, label]) => (
            <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => { setPage(id); setError(""); }}>
              <span className="nav-icon">{icon}</span>{label}{page === id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-avatar">{initials(user.fullName)}</div>
          <div className="sidebar-user"><b>{user.fullName}</b><small>{roleLabel(role)}</small></div>
          <button className="signout-button" onClick={signOut} aria-label="Sign out" title="Sign out">↗</button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>BrightPath School</span><span className="crumb-slash">/</span><b>{currentPage[2]}</b></div>
          <form className="topbar-search" onSubmit={event => { event.preventDefault(); setSearch(globalSearch); setStudentPage(1); setPage("students"); }}>
            <span aria-hidden="true">⌕</span>
            <input aria-label="Search students" placeholder="Search students…" value={globalSearch} onChange={event => setGlobalSearch(event.target.value)} />
            <kbd>↵</kbd>
          </form>
          <div className="topbar-actions">
            <span className="online-indicator"><i /> Live system</span>
            <button className="updates-button" onClick={() => setPage(role === "ADMIN" ? "reports" : "attendance")} aria-label="Open recent updates" title="Recent updates">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
              {role === "ADMIN" && auditLogs.length > 0 && <span>{Math.min(auditLogs.length, 9)}</span>}
            </button>
            <button className="user-chip" onClick={signOut} aria-label={`Sign out ${user.fullName}`}><span className="user-avatar mini">{initials(user.fullName)}</span><span>{user.fullName}</span><span className="chevron">⌄</span></button>
          </div>
        </header>
        <div className="page-content">
          {message && <div className="alert success" role="status">{message}</div>}
          {error && <div className="alert error" role="alert">{error}</div>}
          <div className="page-heading">
            <div><span className="eyebrow">{roleLabel(role).toUpperCase()} PORTAL</span><h1>{pageHeading[0]}</h1><p>{pageHeading[1]}</p></div>
            <button className="secondary-btn" onClick={() => loadAll()} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh data"}</button>
          </div>
          {loading && <div className="loading-bar"><span /></div>}

          {page === "dashboard" && <DashboardPage role={role} user={user} students={students} teachers={teachers} classes={classes} subjects={subjects} attendance={attendance} report={report} fees={fees} exams={exams} auditLogs={auditLogs} setPage={setPage} />}

          {page === "students" && (
            <>
              {role === "ADMIN" && <section className="panel">
                <SectionTitle title="Register a student" detail="Add a synthetic student record and optional class placement." />
                <form className="form-grid" onSubmit={createStudent}>
                  <Field label="Admission number"><input required value={studentForm.admissionNo} onChange={event => setStudentForm({ ...studentForm, admissionNo: event.target.value })} placeholder="e.g. STU-1042" /></Field>
                  <Field label="First name"><input required value={studentForm.firstName} onChange={event => setStudentForm({ ...studentForm, firstName: event.target.value })} /></Field>
                  <Field label="Last name"><input required value={studentForm.lastName} onChange={event => setStudentForm({ ...studentForm, lastName: event.target.value })} /></Field>
                  <Field label="Gender"><select value={studentForm.gender} onChange={event => setStudentForm({ ...studentForm, gender: event.target.value })}><option value="">Not specified</option><option>Female</option><option>Male</option><option>Other</option></select></Field>
                  <Field label="Class"><select value={studentForm.classId} onChange={event => setStudentForm({ ...studentForm, classId: event.target.value, sectionId: "" })}><option value="">Unassigned</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  <Field label="Section"><select value={studentForm.sectionId} onChange={event => setStudentForm({ ...studentForm, sectionId: event.target.value })} disabled={!studentForm.classId}><option value="">Select section</option>{sectionsFor(studentForm.classId).map(section => <option key={section.id} value={section.id}>{section.name}</option>)}</select></Field>
                  <FormActions><button className="primary-btn" disabled={submitting}>+ Add student</button></FormActions>
                </form>
              </section>}
              {role === "ADMIN" && <section className="panel">
                <SectionTitle title="Link a student login" detail="Connect an approved student account to its school record." />
                <form className="form-grid" onSubmit={linkStudentAccount}>
                  <Field label="Student record"><select required value={studentAccountLinkForm.studentId} onChange={event => setStudentAccountLinkForm({ ...studentAccountLinkForm, studentId: event.target.value })}><option value="">Choose student</option>{students.map(student => <option key={student.id} value={student.id}>{student.admissionNo} — {student.firstName} {student.lastName}</option>)}</select></Field>
                  <Field label="Student account"><select required value={studentAccountLinkForm.userId} onChange={event => setStudentAccountLinkForm({ ...studentAccountLinkForm, userId: event.target.value })}><option value="">Choose registered account</option>{unlinkedStudentAccounts.map(account => <option key={account.id} value={account.id}>{account.fullName} · {account.email}</option>)}</select></Field>
                  <FormActions><button className="primary-btn" disabled={submitting || !unlinkedStudentAccounts.length}>Link student login</button></FormActions>
                </form>
                {!unlinkedStudentAccounts.length && <p className="muted">No unlinked student accounts are waiting.</p>}
              </section>}
              <section className="panel">
                <div className="panel-toolbar"><SectionTitle title={role === "GUARDIAN" || role === "STUDENT" ? "Linked student" : "Student directory"} detail={`${visibleStudents.length} record${visibleStudents.length === 1 ? "" : "s"} · private records are role-scoped`} /><SearchBox value={search} onChange={value => { setSearch(value); setStudentPage(1); }} /></div>
                <StudentTable students={pagedStudents} />
                <Pagination page={studentPage} pages={studentPages} onChange={setStudentPage} />
              </section>
            </>
          )}

          {page === "teachers" && <TeachersPage teachers={teachers} requests={accountRequests} onApprove={approveAccountRequest} onReject={rejectAccountRequest} form={teacherForm} setForm={setTeacherForm} onSubmit={createTeacher} submitting={submitting} />}

          {page === "guardians" && (
            <>
              <section className="panel">
                <SectionTitle title="Create guardian access" detail="A guardian can see only the student linked to their account." />
                <form className="form-grid" onSubmit={createGuardian}>
                  <Field label="Full name"><input required value={guardianForm.fullName} onChange={event => setGuardianForm({ ...guardianForm, fullName: event.target.value })} /></Field>
                  <Field label="Email"><input required type="email" value={guardianForm.email} onChange={event => setGuardianForm({ ...guardianForm, email: event.target.value })} /></Field>
                  <Field label="Temporary password · 8+ characters"><input required minLength="8" type="password" value={guardianForm.password} onChange={event => setGuardianForm({ ...guardianForm, password: event.target.value })} /></Field>
                  <Field label="Phone"><input value={guardianForm.phone} onChange={event => setGuardianForm({ ...guardianForm, phone: event.target.value })} /></Field>
                  <Field label="Linked student"><select required value={guardianForm.studentId} onChange={event => setGuardianForm({ ...guardianForm, studentId: event.target.value })}><option value="">Choose student</option>{students.map(student => <option key={student.id} value={student.id}>{student.admissionNo} — {student.firstName} {student.lastName}</option>)}</select></Field>
                  <Field label="Relationship"><select value={guardianForm.relation} onChange={event => setGuardianForm({ ...guardianForm, relation: event.target.value })}><option>Parent</option><option>Guardian</option><option>Other</option></select></Field>
                  <FormActions><button className="primary-btn" disabled={submitting}>Create linked account</button></FormActions>
                </form>
              </section>
              <section className="panel">
                <SectionTitle title="Link a registered guardian" detail="Only administrators can connect a guardian account to a student." />
                <form className="form-grid" onSubmit={linkGuardianStudent}>
                  <Field label="Guardian account"><select required value={guardianLinkForm.guardianId} onChange={event => setGuardianLinkForm({ ...guardianLinkForm, guardianId: event.target.value })}><option value="">Choose guardian</option>{guardians.map(item => <option key={item.id} value={item.id}>{item.user?.fullName} · {item.user?.email}</option>)}</select></Field>
                  <Field label="Student"><select required value={guardianLinkForm.studentId} onChange={event => setGuardianLinkForm({ ...guardianLinkForm, studentId: event.target.value })}><option value="">Choose student</option>{students.map(student => <option key={student.id} value={student.id}>{student.admissionNo} — {student.firstName} {student.lastName}</option>)}</select></Field>
                  <Field label="Relationship"><select value={guardianLinkForm.relation} onChange={event => setGuardianLinkForm({ ...guardianLinkForm, relation: event.target.value })}><option>Parent</option><option>Guardian</option><option>Other</option></select></Field>
                  <FormActions><button className="primary-btn" disabled={submitting}>Link student</button></FormActions>
                </form>
              </section>
              <section className="panel"><SectionTitle title="Guardian accounts" detail="Linked student access" /><GuardianTable guardians={guardians} /></section>
            </>
          )}

          {page === "classes" && (
            <>
              {role === "ADMIN" && <div className="two-column">
                <section className="panel"><SectionTitle title="Create class" /><form className="inline-form" onSubmit={createClass}><Field label="Class name"><input required value={className} onChange={event => setClassName(event.target.value)} placeholder="e.g. Grade 8" /></Field><button className="primary-btn" disabled={submitting}>Create class</button></form></section>
                <section className="panel"><SectionTitle title="Add a section" /><form className="inline-form" onSubmit={createSection}><Field label="Class"><select required value={sectionForm.classId} onChange={event => setSectionForm({ ...sectionForm, classId: event.target.value })}><option value="">Choose class</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Section name"><input required value={sectionForm.name} onChange={event => setSectionForm({ ...sectionForm, name: event.target.value })} placeholder="e.g. A" /></Field><button className="primary-btn" disabled={submitting}>Add section</button></form></section>
              </div>}
              {role === "ADMIN" && <section className="panel">
                <SectionTitle title="Assign a teacher" detail="Teachers may record attendance only in sections assigned here." />
                <form className="form-grid" onSubmit={assignTeacher}>
                  <Field label="Class"><select required value={teacherAssignment.classId} onChange={event => setTeacherAssignment({ ...teacherAssignment, classId: event.target.value, sectionId: "" })}><option value="">Choose class</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  <Field label="Section"><select required value={teacherAssignment.sectionId} onChange={event => setTeacherAssignment({ ...teacherAssignment, sectionId: event.target.value })}><option value="">Choose section</option>{teacherSections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}</select></Field>
                  <Field label="Teacher"><select required value={teacherAssignment.teacherId} onChange={event => setTeacherAssignment({ ...teacherAssignment, teacherId: event.target.value })}><option value="">Choose teacher</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.user?.fullName}</option>)}</select></Field>
                  <FormActions><button className="primary-btn" disabled={submitting}>Assign teacher</button></FormActions>
                </form>
              </section>}
              <section className="panel"><SectionTitle title="Class directory" detail={`${classes.length} classes`} /><ClassCards classes={classes} /></section>
            </>
          )}

          {page === "subjects" && (
            <>
              {role === "ADMIN" && <div className="two-column">
                <section className="panel"><SectionTitle title="Create subject" /><form className="stack-form" onSubmit={createSubject}><Field label="Subject code"><input required value={subjectForm.code} onChange={event => setSubjectForm({ ...subjectForm, code: event.target.value })} placeholder="SCI" /></Field><Field label="Subject name"><input required value={subjectForm.name} onChange={event => setSubjectForm({ ...subjectForm, name: event.target.value })} placeholder="Science" /></Field><button className="primary-btn" disabled={submitting}>Create subject</button></form></section>
                <section className="panel"><SectionTitle title="Assign subject" detail="Assign a class subject to a section and optionally a teacher." /><form className="stack-form" onSubmit={assignSubject}>
                  <Field label="Class"><select required value={assignmentForm.classId} onChange={event => setAssignmentForm({ ...assignmentForm, classId: event.target.value, sectionId: "" })}><option value="">Choose class</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  <Field label="Section"><select required value={assignmentForm.sectionId} onChange={event => setAssignmentForm({ ...assignmentForm, sectionId: event.target.value })}><option value="">Choose section</option>{sectionsFor(assignmentForm.classId).map(section => <option key={section.id} value={section.id}>{section.name}</option>)}</select></Field>
                  <Field label="Subject"><select required value={assignmentForm.subjectId} onChange={event => setAssignmentForm({ ...assignmentForm, subjectId: event.target.value })}><option value="">Choose subject</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.code} — {subject.name}</option>)}</select></Field>
                  <Field label="Teacher (optional)"><select value={assignmentForm.teacherId} onChange={event => setAssignmentForm({ ...assignmentForm, teacherId: event.target.value })}><option value="">Not assigned</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.user?.fullName}</option>)}</select></Field>
                  <button className="primary-btn" disabled={submitting}>Save subject assignment</button>
                </form></section>
              </div>}
              <section className="panel"><SectionTitle title="Subjects & assignments" detail="Available subjects and assigned teaching groups." /><SubjectTable subjects={subjects} /></section>
            </>
          )}

          {page === "attendance" && (
            <>
              {["ADMIN", "TEACHER"].includes(role) && <section className="panel">
                <SectionTitle title="Record attendance" detail="One record per student, date and session; duplicates return a conflict." />
                <form className="form-grid" onSubmit={markAttendance}>
                  <Field label="Student"><select required value={attendanceForm.studentId} onChange={event => setAttendanceForm({ ...attendanceForm, studentId: event.target.value })}><option value="">Choose student</option>{students.map(student => <option key={student.id} value={student.id}>{student.admissionNo} — {student.firstName} {student.lastName}</option>)}</select></Field>
                  <Field label="Date"><input required type="date" value={attendanceForm.date} onChange={event => setAttendanceForm({ ...attendanceForm, date: event.target.value })} /></Field>
                  <Field label="Session"><select value={attendanceForm.session} onChange={event => setAttendanceForm({ ...attendanceForm, session: event.target.value })}><option value="MORNING">Morning</option><option value="AFTERNOON">Afternoon</option></select></Field>
                  <Field label="Status"><select value={attendanceForm.status} onChange={event => setAttendanceForm({ ...attendanceForm, status: event.target.value })}><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="LATE">Late</option></select></Field>
                  <FormActions><button className="primary-btn" disabled={submitting}>Save attendance</button></FormActions>
                </form>
              </section>}
              <section className="panel">
                <div className="panel-toolbar">
                  <SectionTitle title="Attendance register" detail="Filter by date, class or student to review a summary." />
                  <Field label="Filter date"><input type="date" value={attendanceFilterDate} onChange={event => setAttendanceFilterDate(event.target.value)} /></Field>
                </div>
                <div className="attendance-filters">
                  {["ADMIN", "TEACHER"].includes(role) && <Field label="Class"><select value={attendanceFilterClass} onChange={event => { setAttendanceFilterClass(event.target.value); setAttendanceFilterStudent(""); }}><option value="">All classes</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
                  <Field label="Student"><select value={attendanceFilterStudent} onChange={event => setAttendanceFilterStudent(event.target.value)}><option value="">All visible students</option>{students.filter(student => !attendanceFilterClass || student.classId === attendanceFilterClass).map(student => <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>)}</select></Field>
                </div>
                <div className="attendance-summary">
                  <div><span>Present</span><b>{attendancePresent}</b></div>
                  <div><span>Absent</span><b>{attendanceAbsent}</b></div>
                  <div><span>Late</span><b>{attendanceLate}</b></div>
                  <div><span>Attendance rate</span><b>{visibleAttendance.length ? `${Math.round((attendancePresent + attendanceLate) / visibleAttendance.length * 100)}%` : "—"}</b></div>
                </div>
                <AttendanceTable attendance={visibleAttendance} />
              </section>
            </>
          )}

          {page === "exams" && (
            <>
              {["ADMIN", "TEACHER"].includes(role) && <section className="panel">
                <SectionTitle title="Create an examination" detail="Grading defaults to A–F thresholds, with configurable rules available through the API." />
                <form className="form-grid" onSubmit={createExam}>
                  <Field label="Exam title"><input required value={examForm.title} onChange={event => setExamForm({ ...examForm, title: event.target.value })} placeholder="Term 1 assessment" /></Field>
                  <Field label="Class"><select required value={examForm.classId} onChange={event => setExamForm({ ...examForm, classId: event.target.value, sectionId: "", subjectId: "" })}><option value="">Choose class</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  <Field label="Section (optional)"><select value={examForm.sectionId} onChange={event => setExamForm({ ...examForm, sectionId: event.target.value })}><option value="">All assigned sections</option>{examSections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}</select></Field>
                  <Field label="Subject"><select required value={examForm.subjectId} onChange={event => setExamForm({ ...examForm, subjectId: event.target.value })} disabled={!examForm.classId}><option value="">Choose subject</option>{examSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.code} — {subject.name}</option>)}</select></Field>
                  <Field label="Exam date"><input type="date" required value={examForm.examDate} onChange={event => setExamForm({ ...examForm, examDate: event.target.value })} /></Field>
                  <Field label="Maximum marks"><input type="number" min="1" step="1" required value={examForm.maxMarks} onChange={event => setExamForm({ ...examForm, maxMarks: event.target.value })} /></Field>
                  <Field label="Pass marks"><input type="number" min="0" step="1" required value={examForm.passMarks} onChange={event => setExamForm({ ...examForm, passMarks: event.target.value })} /></Field>
                  <FormActions><button className="primary-btn" disabled={submitting}>Create exam</button></FormActions>
                </form>
              </section>}
              {["ADMIN", "TEACHER"].includes(role) && <section className="panel"><SectionTitle title="Enter student marks" detail="Saving an existing student/exam result updates it safely." /><form className="form-grid" onSubmit={saveResult}>
                <Field label="Examination"><select required value={resultForm.examId} onChange={event => setResultForm({ ...resultForm, examId: event.target.value, studentId: "" })}><option value="">Choose exam</option>{exams.map(exam => <option key={exam.id} value={exam.id}>{exam.title} · {exam.schoolClass?.name} · {exam.subject?.name}</option>)}</select></Field>
                <Field label="Student"><select required value={resultForm.studentId} onChange={event => setResultForm({ ...resultForm, studentId: event.target.value })}><option value="">Choose student</option>{students.filter(student => {
                  const exam = exams.find(item => item.id === resultForm.examId);
                  return exam && student.classId === exam.classId && (!exam.sectionId || student.sectionId === exam.sectionId);
                }).map(student => <option key={student.id} value={student.id}>{student.admissionNo} — {student.firstName} {student.lastName}</option>)}</select></Field>
                <Field label={`Marks · max ${exams.find(item => item.id === resultForm.examId)?.maxMarks ?? "—"}`}><input required type="number" min="0" max={exams.find(item => item.id === resultForm.examId)?.maxMarks} step="1" value={resultForm.marks} onChange={event => setResultForm({ ...resultForm, marks: event.target.value })} /></Field>
                <FormActions><button className="primary-btn" disabled={submitting || !resultForm.examId}>Save result</button></FormActions>
              </form></section>}
              <section className="panel"><SectionTitle title="Examination schedule" detail={`${exams.length} assessment${exams.length === 1 ? "" : "s"}`} /><ExamTable exams={exams} /></section>
            </>
          )}

          {page === "fees" && (
            <>
              {role === "ADMIN" && <section className="panel"><SectionTitle title="Issue a fee invoice" detail="Use whole-rupee or paise amounts; totals are stored in integer paise." /><form className="form-grid" onSubmit={createInvoice}>
                <Field label="Student"><select required value={invoiceForm.studentId} onChange={event => setInvoiceForm({ ...invoiceForm, studentId: event.target.value })}><option value="">Choose student</option>{students.map(student => <option key={student.id} value={student.id}>{student.admissionNo} — {student.firstName} {student.lastName}</option>)}</select></Field>
                <Field label="Description"><input required value={invoiceForm.description} onChange={event => setInvoiceForm({ ...invoiceForm, description: event.target.value })} placeholder="Term 1 tuition" /></Field>
                <Field label="Amount (₹)"><input required type="number" min="0.01" step="0.01" value={invoiceForm.amount} onChange={event => setInvoiceForm({ ...invoiceForm, amount: event.target.value })} /></Field>
                <Field label="Due date"><input required type="date" value={invoiceForm.dueDate} onChange={event => setInvoiceForm({ ...invoiceForm, dueDate: event.target.value })} /></Field>
                <FormActions><button className="primary-btn" disabled={submitting}>Issue invoice</button></FormActions>
              </form></section>}
              <section className="panel"><SectionTitle title="Fee ledger" detail="Paid and outstanding totals are calculated from payment records." /><FeeTable fees={fees} canPay={["GUARDIAN", "STUDENT"].includes(role)} onPay={payInvoice} /></section>
            </>
          )}

          {page === "report-card" && (
            <section className="panel"><div className="panel-toolbar"><SectionTitle title="Academic report card" detail="Subject scores, grades and total percentage." />
              <Field label="Student"><select value={selectedReportStudent} onChange={event => { setSelectedReportStudent(event.target.value); loadReportCard(event.target.value); }}><option value="">Choose student</option>{students.map(student => <option key={student.id} value={student.id}>{student.admissionNo} — {student.firstName} {student.lastName}</option>)}</select></Field>
            </div>{reportCard ? <ReportCard card={reportCard} /> : <EmptyState text="Select a linked or assigned student to view their report card." />}</section>
          )}

          {page === "reports" && <ReportsPage report={report} auditLogs={auditLogs} role={role} />}
        </div>
      </main>
    </div>
  );
}

function DashboardPage({ role, user, students, teachers, classes, subjects, attendance, report, fees, exams, auditLogs, setPage }) {
  const todayValue = today();
  const todayRows = attendance.filter(item => String(item.date).slice(0, 10) === todayValue);
  const todaySummary = report?.attendance?.today;
  const todayPresent = todaySummary?.present ?? todayRows.filter(item => item.status === "PRESENT").length;
  const todayAbsent = todaySummary?.absent ?? todayRows.filter(item => item.status === "ABSENT").length;
  const todayRecorded = todaySummary?.recorded ?? todayRows.length;
  const feeDue = fees.reduce((sum, item) => sum + (item.dueCents || 0), 0);
  const upcomingExams = exams
    .filter(exam => String(exam.examDate).slice(0, 10) >= todayValue)
    .sort((a, b) => String(a.examDate).localeCompare(String(b.examDate)))
    .slice(0, 5);
  const overdueInvoices = fees.filter(invoice => invoice.dueCents > 0 && String(invoice.dueDate).slice(0, 10) < todayValue);
  const calculatedWeeklyAttendance = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = dateKey(date);
    const entries = attendance.filter(item => String(item.date).slice(0, 10) === key);
    const present = entries.filter(item => item.status === "PRESENT" || item.status === "LATE").length;
    return {
      key,
      label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(date),
      present,
      absent: entries.filter(item => item.status === "ABSENT").length
    };
  });
  const weeklyAttendance = report?.attendance?.byDay?.map(item => ({
    key: item.date,
    label: new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(`${item.date}T00:00:00Z`)),
    present: item.present,
    absent: item.absent
  })) || calculatedWeeklyAttendance;
  const weeklyTotal = weeklyAttendance.reduce((sum, item) => sum + item.present + item.absent, 0);
  const attendancePercent = weeklyTotal
    ? Math.round(weeklyAttendance.reduce((sum, item) => sum + item.present, 0) / weeklyTotal * 100)
    : null;
  const attendanceLast30Days = attendance.filter(item => {
    const date = String(item.date).slice(0, 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 29);
    return date >= dateKey(cutoff) && date <= todayValue;
  });
  const familyAttendance = attendanceLast30Days.length
    ? Math.round(attendanceLast30Days.filter(item => item.status !== "ABSENT").length / attendanceLast30Days.length * 100)
    : null;
  const enrollmentByClass = classes.map(schoolClass => ({
    name: schoolClass.name,
    count: students.filter(student => student.classId === schoolClass.id).length
  })).sort((a, b) => b.count - a.count);
  const recentStudents = [...students].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5);
  const recentActivity = report?.recentActivity?.length
    ? report.recentActivity.map(item => ({ id: item.id, title: activityTitle(item), actor: item.actor, date: item.createdAt, type: item.entity }))
    : role === "ADMIN"
      ? auditLogs.slice(0, 5).map(item => ({ id: item.id, title: activityTitle(item), actor: item.actor?.fullName, date: item.createdAt, type: item.entity }))
    : [...attendance].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5).map(item => ({
      id: item.id,
      title: `${item.status?.toLowerCase()} attendance recorded`,
      actor: `${item.student?.firstName || "Student"} ${item.student?.lastName || ""}`.trim(),
      date: item.createdAt,
      type: "Attendance"
    }));

  const cards = role === "ADMIN" ? [
    { title: "Total students", value: report?.students ?? students.length, note: "Currently enrolled", icon: "♙", tone: "blue", change: "Across all classes" },
    { title: "Teachers & staff", value: report?.teachers ?? teachers.length, note: "Active faculty members", icon: "♟", tone: "violet", change: `${subjects.length} subjects managed` },
    { title: "Classes", value: report?.classes ?? classes.length, note: "Active class groups", icon: "▤", tone: "amber", change: `${classes.reduce((sum, item) => sum + (item.sections?.length || 0), 0)} sections` },
    { title: "Attendance rate", value: attendancePercent === null ? "—" : `${attendancePercent}%`, note: "This week's average", icon: "↗", tone: "green", change: `${weeklyTotal} records this week` },
    { title: "Today's attendance", value: todayPresent, note: "Students present today", icon: "✓", tone: "green", change: `${todayRecorded} records so far` },
    { title: "Absent students", value: todayAbsent, note: "Students absent today", icon: "!", tone: "amber", change: "Today's attendance register" },
    { title: "Active classes", value: report?.classes ?? classes.length, note: "Classes in session", icon: "▣", tone: "blue", change: "Across this academic year" },
    { title: "Recent grades", value: report?.recentGradesCount ?? 0, note: "Results entered today", icon: "★", tone: "violet", change: `${report?.recentGrades?.length || 0} recent results to review` }
  ] : role === "TEACHER" ? [
    { title: "My students", value: students.length, note: "In your assigned sections", icon: "♙", tone: "blue", change: `${classes.length} assigned classes` },
    { title: "Upcoming exams", value: upcomingExams.length, note: "Scheduled from today", icon: "✎", tone: "violet", change: `${exams.length} exams in view` },
    { title: "Today's attendance", value: todayPresent, note: "Students present today", icon: "✓", tone: "green", change: `${todayRecorded} records so far` },
    { title: "Assigned classes", value: classes.length, note: "Your teaching groups", icon: "▤", tone: "amber", change: `${subjects.length} subjects available` }
  ] : [
    { title: "Linked student", value: students.length, note: students.length === 1 ? students[0].firstName : "Your linked students", icon: "♙", tone: "blue", change: students.map(student => student.schoolClass?.name).filter(Boolean).join(", ") || "Class not assigned" },
    { title: "Attendance · 30 days", value: familyAttendance === null ? "—" : `${familyAttendance}%`, note: `${attendanceLast30Days.length} attendance records`, icon: "✓", tone: "green", change: familyAttendance === null ? "No recent records yet" : "Present or late" },
    { title: "Upcoming exams", value: upcomingExams.length, note: "For your linked student", icon: "✎", tone: "violet", change: upcomingExams[0] ? `Next: ${formatDate(upcomingExams[0].examDate)}` : "No exams scheduled" },
    { title: "Fees to pay", value: formatMoney(feeDue), note: `${fees.length} linked invoices`, icon: "₹", tone: "amber", change: overdueInvoices.length ? `${overdueInvoices.length} overdue` : "No overdue invoices" }
  ];

  const quickActions = role === "ADMIN"
    ? [["students", "♙", "Add a student"], ["attendance", "✓", "Take attendance"], ["fees", "₹", "Issue an invoice"], ["reports", "▥", "View reports"]]
    : role === "TEACHER"
      ? [["attendance", "✓", "Take attendance"], ["exams", "✎", "Enter exam marks"], ["classes", "▤", "View my classes"], ["students", "♙", "Find a student"]]
      : [["attendance", "✓", "View attendance"], ["exams", "✎", "Exam schedule"], ["report-card", "▤", "Report card"], ["fees", "₹", "View fee ledger"]];

  const dashboardTitle = role === "GUARDIAN"
    ? "Your family, in the loop."
    : role === "STUDENT"
      ? `Keep learning, ${students[0]?.firstName || "one step at a time"}.`
      : role === "TEACHER"
        ? `Ready for a great day, ${user.fullName.split(" ")[0]}?`
        : `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${user.fullName.split(" ")[0]}.`;

  return <>
    <div className="welcome-strip"><div><span className="eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date()).toUpperCase()} · ACADEMIC YEAR 2026–27</span><h2>{dashboardTitle}</h2><p>{role === "ADMIN" ? "Here is your school at a glance. Pick up where your team needs you most." : role === "TEACHER" ? "Your assigned classes, student progress and today's attendance are all in one place." : "Attendance, academic progress and fee information for your linked student."}</p></div><div className="welcome-illustration" aria-hidden="true"><span>✦</span><b>Learn<br />together.</b></div></div>
    <div className="stats-grid dashboard-stats">{cards.map(card => <DashboardStat key={card.title} {...card} />)}</div>
    <div className="dashboard-grid">
      <section className="panel chart-panel">
        <div className="panel-toolbar"><SectionTitle title="Weekly attendance" detail="Present and absent student records across the last seven days" /><div className="chart-legend-group"><span className="chart-legend"><i className="present-key" /> Present</span><span className="chart-legend"><i className="absent-key" /> Absent</span></div></div>
        <WeeklyAttendanceChart data={weeklyAttendance} />
      </section>
      <section className="panel quick-panel"><div className="panel-toolbar"><SectionTitle title="Recent activity" detail="Latest updates from your school" /><button className="text-button" onClick={() => setPage(role === "ADMIN" ? "reports" : "attendance")}>View all →</button></div><ActivityList items={recentActivity} /></section>
    </div>
    <div className="dashboard-grid dashboard-lower">
      {role === "ADMIN"
        ? <>
          <section className="panel"><div className="panel-toolbar"><SectionTitle title="Enrollment by class" detail="Student distribution across active classes" /><button className="text-button" onClick={() => setPage("classes")}>All classes →</button></div><EnrollmentList classes={enrollmentByClass} /></section>
          <section className="panel"><div className="panel-toolbar"><SectionTitle title="Recently graded" detail="Latest marks entered today" /><button className="text-button" onClick={() => setPage("exams")}>Examinations →</button></div><RecentGradesList grades={report?.recentGrades || []} /></section>
        </>
        : <>
          <section className="panel"><div className="panel-toolbar"><SectionTitle title="Upcoming examinations" detail="Your next scheduled assessments" /><button className="text-button" onClick={() => setPage("exams")}>Exam schedule →</button></div><UpcomingExamList exams={upcomingExams} /></section>
          <section className="panel"><div className="panel-toolbar"><SectionTitle title="Quick actions" detail="Common tasks for your role." /></div><QuickActions actions={quickActions} setPage={setPage} /></section>
        </>}
    </div>
    {role === "ADMIN" && <div className="dashboard-grid dashboard-lower">
      <section className="panel"><div className="panel-toolbar"><SectionTitle title="Recently enrolled" detail="Latest student records" /><button className="text-button" onClick={() => setPage("students")}>Student directory →</button></div><StudentTable students={recentStudents} compact /></section>
      <section className="panel fee-health-panel"><SectionTitle title="Fee collection" detail="Payments compared with billed fees" />
        <FeeCollectionSummary fees={fees} />
        <button className="text-button" onClick={() => setPage("fees")}>Open fee ledger →</button>
      </section>
    </div>}
    {role === "ADMIN" && <section className="panel quick-action-panel"><div className="panel-toolbar"><SectionTitle title="Quick actions" detail="Jump to a common school operation." /></div><QuickActions actions={quickActions} setPage={setPage} /></section>}
  </>;
}

function activityTitle(item) {
  let details;
  try {
    details = item.details ? JSON.parse(item.details) : {};
  } catch {
    details = null;
  }
  const subject = details?.admissionNo || details?.title || details?.invoiceNo || "";
  const verb = ({ CREATE: "created", ASSIGN: "updated an assignment", PAYMENT: "recorded a payment", UPSERT: "updated a result" })[item.action] || item.action.toLowerCase();
  return `${item.entity} ${verb}${subject ? ` · ${subject}` : ""}`;
}

function DashboardStat({ title, value, note, icon, tone, change }) {
  return <article className="stat-card dashboard-stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-copy"><span>{title}</span><strong>{value}</strong><small>{note}</small></div><div className="stat-change">{change}</div></article>;
}

function WeeklyAttendanceChart({ data }) {
  const width = 650;
  const height = 220;
  const left = 42;
  const right = 12;
  const top = 14;
  const bottom = 34;
  const chartHeight = height - top - bottom;
  const chartWidth = width - left - right;
  const maximum = Math.max(5, ...data.map(item => Math.max(item.present, item.absent)));
  const y = value => top + chartHeight - (value / maximum) * chartHeight;
  const x = index => left + (data.length > 1 ? index * chartWidth / (data.length - 1) : chartWidth / 2);
  const presentPoints = data.map((item, index) => `${x(index)},${y(item.present)}`).join(" ");
  const absentPoints = data.map((item, index) => `${x(index)},${y(item.absent)}`).join(" ");
  const hasData = data.some(item => item.present + item.absent > 0);
  const ticks = [maximum, Math.round(maximum * .75), Math.round(maximum * .5), Math.round(maximum * .25), 0];
  return <div className="weekly-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Present and absent attendance counts for the last seven days">
      {ticks.map((tick, index) => <g key={`${tick}-${index}`}>
        <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="chart-grid-line" />
        <text x={left - 8} y={y(tick) + 3} textAnchor="end" className="chart-tick-label">{tick}</text>
      </g>)}
      {hasData && <>
        <polyline points={presentPoints} className="chart-line chart-line-present" />
        <polyline points={absentPoints} className="chart-line chart-line-absent" />
      </>}
      {data.map((item, index) => <g key={item.key}>
        {hasData && <><circle cx={x(index)} cy={y(item.present)} r="3.5" className="chart-point chart-point-present"><title>{item.label}: {item.present} present</title></circle><circle cx={x(index)} cy={y(item.absent)} r="3.5" className="chart-point chart-point-absent"><title>{item.label}: {item.absent} absent</title></circle></>}
        <text x={x(index)} y={height - 10} textAnchor="middle" className="chart-day-name">{item.label}</text>
      </g>)}
    </svg>
    {!hasData && <p className="chart-empty">Attendance data will appear as soon as daily registers are recorded.</p>}
  </div>;
}

function EnrollmentList({ classes }) {
  if (!classes.length) return <EmptyState text="Create a class and enrol students to see distribution." />;
  const max = Math.max(1, ...classes.map(item => item.count));
  return <div className="enrollment-list">{classes.slice(0, 6).map(item => <div className="enrollment-row" key={item.name}>
    <div className="enrollment-label"><b>{item.name}</b><span>{item.count} student{item.count === 1 ? "" : "s"}</span></div>
    <div className="enrollment-track"><span style={{ width: `${Math.max(3, item.count / max * 100)}%` }} /></div>
  </div>)}</div>;
}

function UpcomingExamList({ exams }) {
  if (!exams.length) return <EmptyState text="No upcoming exams are scheduled for your account." />;
  return <div className="upcoming-list">{exams.map(exam => <div className="upcoming-row" key={exam.id}>
    <div className="exam-date-tile"><b>{new Date(`${String(exam.examDate).slice(0, 10)}T00:00:00`).getDate()}</b><span>{new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(exam.examDate))}</span></div>
    <div className="upcoming-info"><b>{exam.title}</b><span>{exam.subject?.name} · {exam.schoolClass?.name} {exam.section?.name || ""}</span></div>
    <span className="exam-marks">{exam.maxMarks} marks</span>
  </div>)}</div>;
}

function RecentGradesList({ grades }) {
  if (!grades.length) return <EmptyState text="Grades recorded today will appear here." />;
  return <div className="grade-activity-list">{grades.map(result => <div className="grade-activity-row" key={result.id}>
    <span className="grade-activity-icon">{result.grade}</span>
    <div><b>{result.student.firstName} {result.student.lastName}</b><span>{result.exam.subject.name} · {result.exam.title}</span></div>
    <strong>{result.marks}</strong>
  </div>)}</div>;
}

function QuickActions({ actions, setPage }) {
  return <div className="dashboard-quick-actions">{actions.map(([id, icon, label]) => <button key={id} onClick={() => setPage(id)}><span>{icon}</span><b>{label}</b><i>→</i></button>)}</div>;
}

function ActivityList({ items }) {
  if (!items.length) return <EmptyState text="New activity will appear here as work is completed." />;
  return <div className="activity-list">{items.map(item => <div className="activity-row" key={item.id}>
    <span className="activity-dot">{item.type === "Attendance" ? "✓" : "•"}</span>
    <div><b>{item.title}</b><span>{item.actor || "School team"} · {formatDateTime(item.date)}</span></div>
  </div>)}</div>;
}

function FeeCollectionSummary({ fees }) {
  const billed = fees.reduce((sum, item) => sum + item.amountCents, 0);
  const paid = fees.reduce((sum, item) => sum + item.paidCents, 0);
  const due = fees.reduce((sum, item) => sum + item.dueCents, 0);
  const percent = billed ? Math.round(paid / billed * 100) : 0;
  return <div className="fee-health">
    <div className="fee-progress"><span style={{ width: `${percent}%` }} /></div>
    <div className="fee-progress-label"><span>{percent}% collected</span><b>{formatMoney(paid)} of {formatMoney(billed)}</b></div>
    <div className="fee-health-totals"><div><span>Outstanding</span><b>{formatMoney(due)}</b></div><div><span>Open invoices</span><b>{fees.filter(item => item.dueCents > 0).length}</b></div></div>
  </div>;
}

function TeachersPage({ teachers, requests, onApprove, onReject, form, setForm, onSubmit, submitting }) {
  return <><section className="panel"><SectionTitle title="Account requests" detail="Approve staff accounts only after verifying their identity and role." />
    {!requests.length ? <EmptyState text="No staff account requests are waiting for approval." /> :
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Requested role</th><th>Requested</th><th>Actions</th></tr></thead><tbody>{requests.map(account => <tr key={account.id}><td><b>{account.fullName}</b></td><td>{account.email}</td><td>{roleLabel(account.role)}</td><td>{formatDateTime(account.createdAt)}</td><td><div className="request-actions"><button className="small-btn" disabled={submitting} onClick={() => onApprove(account.id)}>Approve</button><button className="small-btn danger-btn" disabled={submitting} onClick={() => onReject(account.id)}>Reject</button></div></td></tr>)}</tbody></table></div>}
  </section><section className="panel"><SectionTitle title="Add a teacher" detail="Creates a teacher account. Assign classes from Classes & sections." /><form className="form-grid" onSubmit={onSubmit}>
    <Field label="Full name"><input required value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} /></Field>
    <Field label="Email"><input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
    <Field label="Temporary password · 8+ characters"><input required minLength="8" type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></Field>
    <Field label="Employee number"><input required value={form.employeeNo} onChange={event => setForm({ ...form, employeeNo: event.target.value })} /></Field>
    <Field label="Phone (optional)"><input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></Field>
    <FormActions><button className="primary-btn" disabled={submitting}>Create teacher</button></FormActions>
  </form></section><section className="panel"><SectionTitle title="Teaching team" detail={`${teachers.length} teacher account${teachers.length === 1 ? "" : "s"}`} /><TeacherTable teachers={teachers} /></section></>;
}

function ReportsPage({ report, auditLogs, role }) {
  if (!report) return <section className="panel"><EmptyState text="No report data is available yet." /></section>;
  return <>
    <div className="stats-grid report-stats">
      <StatCard title="Attendance rate" value={`${report.attendance.ratePercent}%`} note={`${report.attendance.recorded} records in scope`} icon="✓" tone="green" />
      {role === "ADMIN" && <>
        <StatCard title="Total students" value={report.students} note="Across all classes" icon="♙" tone="blue" />
        <StatCard title="Fee invoices" value={report.fees.invoiceCount} note={`Issued ${formatMoney(report.fees.invoicedCents)}`} icon="₹" tone="amber" />
        <StatCard title="Outstanding fees" value={formatMoney(report.fees.outstandingCents)} note={`${formatMoney(report.fees.paidCents)} received`} icon="↘" tone="violet" />
      </>}
    </div>
    <section className="panel"><SectionTitle title="Business activity" detail="Recent material changes, attributed to the acting account." /><AuditTable records={auditLogs} /></section>
  </>;
}

function ReportCard({ card }) {
  return <div className="report-card">
    <div className="report-banner"><div><span className="eyebrow">BRIGHTPATH SCHOOL · ACADEMIC RECORD</span><h2>{card.student.firstName} {card.student.lastName}</h2><p>{card.student.admissionNo} · {card.student.schoolClass?.name || "Unassigned"} {card.student.section?.name || ""}</p></div><div className="report-score"><b>{card.percentage}%</b><span>Overall</span></div></div>
    <div className="table-wrap"><table><thead><tr><th>Assessment</th><th>Subject</th><th>Date</th><th>Score</th><th>Grade</th></tr></thead><tbody>{card.results.map(item => <tr key={item.id}><td>{item.exam.title}</td><td>{item.exam.subject.name}</td><td>{formatDate(item.exam.examDate)}</td><td>{item.marks} / {item.exam.maxMarks}</td><td><span className="grade-pill">{item.grade}</span></td></tr>)}</tbody></table></div>
    <div className="report-total"><span>Total marks</span><b>{card.totalMarks} / {card.totalMaximum}</b><span>{card.results.length} assessment{card.results.length === 1 ? "" : "s"}</span></div>
  </div>;
}

function StudentTable({ students, compact = false }) {
  if (!students.length) return <EmptyState text="No student records match your view." />;
  return <div className="table-wrap"><table><thead><tr><th>Student</th><th>Admission no.</th>{!compact && <th>Class & section</th>}<th>Status</th></tr></thead><tbody>{students.map(student => <tr key={student.id}><td><div className="student-cell"><span className="student-avatar">{initials(`${student.firstName} ${student.lastName}`)}</span><span><b>{student.firstName} {student.lastName}</b><small>{student.gender || "Student"}</small></span></div></td><td>{student.admissionNo}</td>{!compact && <td>{student.schoolClass?.name || "Unassigned"} {student.section?.name || ""}</td>}<td><span className="status-pill active">Enrolled</span></td></tr>)}</tbody></table></div>;
}

function TeacherTable({ teachers }) {
  if (!teachers.length) return <EmptyState text="No teacher accounts created." />;
  return <div className="table-wrap"><table><thead><tr><th>Teacher</th><th>Employee no.</th><th>Email</th><th>Status</th></tr></thead><tbody>{teachers.map(item => <tr key={item.id}><td><b>{item.user?.fullName}</b></td><td>{item.employeeNo}</td><td>{item.user?.email}</td><td><span className={`status-pill ${item.user?.isActive ? "active" : "inactive"}`}>{item.user?.isActive ? "Active" : "Inactive"}</span></td></tr>)}</tbody></table></div>;
}

function GuardianTable({ guardians }) {
  if (!guardians.length) return <EmptyState text="No guardian accounts created." />;
  return <div className="table-wrap"><table><thead><tr><th>Guardian</th><th>Email</th><th>Linked students</th></tr></thead><tbody>{guardians.map(item => <tr key={item.id}><td><b>{item.user?.fullName}</b><small className="cell-subtitle">{item.user?.isActive ? "Active account" : "Inactive account"}</small></td><td>{item.user?.email}</td><td>{item.students?.length ? item.students.map(link => `${link.student.firstName} ${link.student.lastName} (${link.relation || "Guardian"})`).join(", ") : "Not linked yet"}</td></tr>)}</tbody></table></div>;
}

function ClassCards({ classes }) {
  if (!classes.length) return <EmptyState text="No classes have been created." />;
  return <div className="class-grid">{classes.map(item => <article className="class-card" key={item.id}><div className="class-card-top"><span className="class-icon">▤</span><span className="status-pill active">{item._count?.students ?? 0} students</span></div><h3>{item.name}</h3><div className="section-tags">{(item.sections || []).map(section => <span key={section.id}>{section.name}</span>)}</div><small>{item.sections?.length || 0} section{item.sections?.length === 1 ? "" : "s"}</small></article>)}</div>;
}

function SubjectTable({ subjects }) {
  if (!subjects.length) return <EmptyState text="No subjects are assigned yet." />;
  return <div className="table-wrap"><table><thead><tr><th>Subject</th><th>Code</th><th>Class / section</th><th>Teacher</th></tr></thead><tbody>{subjects.flatMap(subject => (subject.classAssignments?.length ? subject.classAssignments : [null]).map((assignment, index) => <tr key={`${subject.id}-${index}`}><td><b>{subject.name}</b></td><td><span className="code-pill">{subject.code}</span></td><td>{assignment ? `${assignment.schoolClass.name} ${assignment.section?.name || ""}` : "Not assigned"}</td><td>{assignment?.teacher?.user?.fullName || "—"}</td></tr>))}</tbody></table></div>;
}

function AttendanceTable({ attendance }) {
  if (!attendance.length) return <EmptyState text="No attendance entries found." />;
  return <div className="table-wrap"><table><thead><tr><th>Date</th><th>Student</th><th>Session</th><th>Status</th></tr></thead><tbody>{attendance.map(item => <tr key={item.id}><td>{formatDate(item.date)}</td><td>{item.student?.firstName} {item.student?.lastName}</td><td>{item.session?.toLowerCase()}</td><td><span className={`status-pill ${item.status?.toLowerCase()}`}>{item.status?.toLowerCase()}</span></td></tr>)}</tbody></table></div>;
}

function ExamTable({ exams }) {
  if (!exams.length) return <EmptyState text="No examinations created yet." />;
  return <div className="table-wrap"><table><thead><tr><th>Assessment</th><th>Subject</th><th>Class</th><th>Date</th><th>Marks</th></tr></thead><tbody>{exams.map(exam => <tr key={exam.id}><td><b>{exam.title}</b></td><td>{exam.subject?.name}</td><td>{exam.schoolClass?.name} {exam.section?.name || ""}</td><td>{formatDate(exam.examDate)}</td><td>{exam.passMarks} / {exam.maxMarks} pass</td></tr>)}</tbody></table></div>;
}

function FeeTable({ fees, canPay, onPay }) {
  if (!fees.length) return <EmptyState text="No fee invoices found for your account." />;
  return <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Student</th><th>Due date</th><th>Invoiced</th><th>Paid</th><th>Balance</th>{canPay && <th>Action</th>}</tr></thead><tbody>{fees.map(invoice => <tr key={invoice.id}><td><b>{invoice.invoiceNo}</b><small className="cell-subtitle">{invoice.description}</small></td><td>{invoice.student?.firstName} {invoice.student?.lastName}</td><td>{formatDate(invoice.dueDate)}</td><td>{formatMoney(invoice.amountCents)}</td><td>{formatMoney(invoice.paidCents)}</td><td><b>{formatMoney(invoice.dueCents)}</b></td>{canPay && <td>{invoice.dueCents > 0 ? <button className="small-btn" onClick={() => onPay(invoice)}>Pay (simulated)</button> : <span className="status-pill active">Settled</span>}</td>}</tr>)}</tbody></table></div>;
}

function AuditTable({ records }) {
  if (!records?.length) return <EmptyState text="No audit events have been recorded yet." />;
  return <div className="table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record</th></tr></thead><tbody>{records.map(item => <tr key={item.id}><td>{formatDateTime(item.createdAt)}</td><td>{item.actor?.fullName}</td><td><span className="code-pill">{item.action}</span></td><td>{item.entity}{item.details ? ` · ${JSON.parse(item.details).admissionNo || JSON.parse(item.details).title || JSON.parse(item.details).amountCents || ""}` : ""}</td></tr>)}</tbody></table></div>;
}

function StatCard({ title, value, note, icon, tone }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-copy"><span>{title}</span><strong>{value}</strong><small>{note}</small></div><span className="stat-spark">↗</span></article>;
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function SectionTitle({ title, detail }) {
  return <div className="section-title"><h2>{title}</h2>{detail && <p>{detail}</p>}</div>;
}

function FormActions({ children }) {
  return <div className="form-actions">{children}</div>;
}

function EmptyState({ text }) {
  return <div className="empty-state"><span>◌</span><p>{text}</p></div>;
}

function SearchBox({ value, onChange }) {
  return <label className="search-box"><span>⌕</span><input aria-label="Search students" placeholder="Search students…" value={value} onChange={event => onChange(event.target.value)} /></label>;
}

function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return <div className="pagination"><span>Page {page} of {pages}</span><div><button disabled={page <= 1} onClick={() => onChange(page - 1)}>←</button><button disabled={page >= pages} onClick={() => onChange(page + 1)}>→</button></div></div>;
}

function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("");
}

function roleLabel(role) {
  return ({ ADMIN: "Administrator", TEACHER: "Teacher", GUARDIAN: "Guardian", STUDENT: "Student" })[role] || "School account";
}

function formatMoney(cents = 0) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(cents / 100);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default App;
