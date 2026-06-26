"use client";

import {
  BadgeIndianRupee,
  Bot,
  BotMessageSquare,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  Database,
  Eye,
  FilePenLine,
  FileText,
  LayoutDashboard,
  MessageCircle,
  MessageSquareText,
  PanelLeft,
  Pencil,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  SquareKanban,
  Users,
  UserPlus,
  X,
  CreditCard,
  ClipboardList
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmployeeTasksView from "./EmployeeTasksView";
import TaskAssignmentModal from "./TaskAssignmentModal";



// Finance view component
import FinanceView from "./FinanceView";
import WhatsAppChatView from "./WhatsAppChatView";


import { brainDocuments } from "../lib/demo-documents";
import type { BrainDocument, ChangeRequest, ChatMessage } from "../lib/types";

type View = "dashboard" | "employees" | "projects" | "crm" | "documents" | "finance" | "tasks" | "whatsapp";
type EmployeeEditState = Record<string, string>;
type LeadEditState = Record<string, string>;
type ViewedEmployeeDocument = {
  employeeName: string;
  label: string;
  status: string;
  value: string;
  url: string;
};

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Command", icon: LayoutDashboard },
  { id: "employees", label: "Employees", icon: Users },
  { id: "projects", label: "Projects", icon: SquareKanban },
  { id: "crm", label: "CRM", icon: BriefcaseBusiness },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);

const asText = (document: BrainDocument, key: string) => String(document.fields[key] ?? "");
const asNumber = (document: BrainDocument, key: string) => Number(document.fields[key] ?? 0);
const asStringList = (document: BrainDocument, key: string) => {
  const value = document.fields[key];
  return Array.isArray(value) ? value : value ? [String(value)] : [];
};

const presentLabel = (value: string) => (value.trim() ? value : "Missing");
const salaryInputToNumber = (value?: string) => {
  if (!value) return 0;
  const cleaned = value.trim().toLowerCase();

  if (!cleaned || cleaned === "-") {
    return 0;
  }

  if (cleaned.endsWith("k")) {
    return Number(cleaned.replace("k", "")) * 1000;
  }

  return Number(cleaned.replace(/[^0-9.]/g, "")) || 0;
};

function AnimatedValue({ value }: { value: string | number }) {
  const strVal = String(value);
  const numericPart = strVal.replace(/[^0-9.]/g, "");
  const targetNumber = parseFloat(numericPart);

  const [currentNumber, setCurrentNumber] = useState(0);

  useEffect(() => {
    if (isNaN(targetNumber) || targetNumber === 0) {
      return;
    }
    
    let start = 0;
    const duration = 750; // ms
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easedProgress = progress * (2 - progress);
      const val = Math.floor(start + easedProgress * (targetNumber - start));
      
      setCurrentNumber(val);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setCurrentNumber(targetNumber);
      }
    };

    requestAnimationFrame(step);
  }, [targetNumber]);

  if (isNaN(targetNumber) || targetNumber === 0) {
    return <>{strVal}</>;
  }

  const matchesPrefix = strVal.match(/^[^0-9]*/);
  const prefix = matchesPrefix ? matchesPrefix[0] : "";
  const suffix = strVal.replace(prefix, "").replace(/[0-9,.]/g, "");

  const formatted = currentNumber.toLocaleString("en-IN");
  return <>{prefix}{formatted}{suffix}</>;
}

const leadStages = ["Old Leads", "Contacts", "Proposal", "Project Started", "Completed"] as const;
export default function EnxtBrainApp() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [documents, setDocuments] = useState<BrainDocument[]>(brainDocuments);
  const [isInitializing, setIsInitializing] = useState(true);
  const [dbSyncStatus, setDbSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [globalToast, setGlobalToast] = useState<{ message: string; type: "success" | "error" | "loading" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "loading" = "success") => {
    setGlobalToast({ message, type });
    setTimeout(() => setGlobalToast(null), 3000);
  };
  
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [activeTabRect, setActiveTabRect] = useState<{ left: number; width: number; top: number; height: number } | null>(null);
  const navContainerRef = useRef<HTMLDivElement>(null);

  const updateActiveTabRect = () => {
    if (!navContainerRef.current) return;
    const activeEl = navContainerRef.current.querySelector(".notch-nav-item.active") as HTMLElement;
    if (activeEl) {
      setActiveTabRect({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
        top: activeEl.offsetTop,
        height: activeEl.offsetHeight
      });
    }
  };

  useEffect(() => {
    updateActiveTabRect();
    window.addEventListener("resize", updateActiveTabRect);
    return () => window.removeEventListener("resize", updateActiveTabRect);
  }, [activeView, isInitializing]);

  useEffect(() => {
    const timer = setTimeout(updateActiveTabRect, 40);
    return () => clearTimeout(timer);
  }, [activeView, isInitializing]);


  useEffect(() => {
    // Fetch initial documents from server
    setDbSyncStatus("saving");
    fetch("/api/documents", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) {
          console.warn("[EnxtBrain] API returned", res.status, "- falling back to local data");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data && Array.isArray(data) && data.length > 0) {
          setDocuments(data);
          setDbSyncStatus("saved");
          console.log("[EnxtBrain] Loaded", data.length, "documents from database");
        } else {
          console.warn("[EnxtBrain] No valid data from API, using local documents");
          setDbSyncStatus("saved");
        }
      })
      .catch((err) => {
        console.error("[EnxtBrain] Failed to load documents from server", err);
        setDbSyncStatus("error");
      })
      .finally(() => {
        setIsInitializing(false);
      });
  }, []);
  const [documentQuery, setDocumentQuery] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState(brainDocuments[0].id);
  const [editText, setEditText] = useState(brainDocuments[0].body);
  const [writeMode, setWriteMode] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [isBrainThinking, setIsBrainThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro-founder",
      role: "founder",
      content: "What should I look at today?"
    },
    {
      id: "intro-brain",
      role: "brain",
      content:
        "Enxt Brain sees 16 employees, 10 AI projects, 0 clients, and 40 leads. Employee docs and the CRM pipeline are ready to search, edit, and update."
    }
  ]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
  const handleTaskCreated = () => {
    setTaskRefreshKey(k => k + 1);
    setShowTaskModal(false);
  };

  useEffect(() => {
    if (isInitializing) return; // Don't save during initial load

    console.log("[EnxtBrain] Saving", documents.length, "documents to database...");
    setDbSyncStatus("saving");
    fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(documents)
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to save documents");
        return res.json();
      })
      .then((data) => {
        if (data.success) {
          console.log("[EnxtBrain] ✓ Database saved successfully");
          setDbSyncStatus("saved");
        } else {
          console.error("[EnxtBrain] ✗ Save returned unexpected response", data);
          setDbSyncStatus("error");
        }
      })
      .catch((err) => {
        console.error("Failed to save documents", err);
        setDbSyncStatus("error");
      });
  }, [documents, isInitializing]);

  const employees = useMemo(() => documents.filter((document) => document.type === "employee"), [documents]);
  const projects = useMemo(() => documents.filter((document) => document.type === "project"), [documents]);
  const clients = useMemo(() => documents.filter((document) => document.type === "client"), [documents]);
  const leads = useMemo(() => documents.filter((document) => document.type === "lead"), [documents]);

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? documents[0];
  const monthlyPayroll = employees
    .filter((employee) => asText(employee, "status") === "Active")
    .reduce((total, employee) => total + asNumber(employee, "monthlySalaryInr"), 0);
  const projectBudget = projects.reduce((total, project) => total + asNumber(project, "budgetInr"), 0);
  const pipelineValue = leads.reduce((total, lead) => total + asNumber(lead, "potentialValueInr"), 0);
  const clientValue = clients.reduce((total, client) => total + asNumber(client, "annualValueInr"), 0);

  const filteredDocuments = useMemo(() => {
    const query = documentQuery.trim().toLowerCase();

    if (!query) {
      return documents;
    }

    return documents.filter((document) => {
      const searchable = `${document.title} ${document.type} ${document.status} ${document.owner} ${document.tags.join(
        " "
      )} ${document.body}`.toLowerCase();
      return searchable.includes(query);
    });
  }, [documentQuery, documents]);

  const askBrain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const prompt = chatInput.trim();

    if (!prompt || isBrainThinking) {
      return;
    }

    const founderMessage: ChatMessage = {
      id: `founder-${Date.now()}`,
      role: "founder",
      content: prompt
    };
    const nextMessages = [...messages, founderMessage];

    setMessages(nextMessages);
    setChatInput("");
    setIsBrainThinking(true);

    try {
      const response = await fetch("/api/brain-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt,
          documents,
          messages: nextMessages,
          writeMode
        })
      });
      const payload = (await response.json()) as { answer?: string; error?: string };
      const brainMessage: ChatMessage = {
        id: `brain-${Date.now()}`,
        role: "brain",
        content: response.ok
          ? payload.answer ?? "I could not produce an answer from the current company memory."
          : payload.error ?? "The AI API could not answer right now."
      };

      setMessages((current) => [...current, brainMessage]);
    } catch {
      const brainMessage: ChatMessage = {
        id: `brain-${Date.now()}`,
        role: "brain",
        content: "The AI API is unreachable. Check the server, GEMINI_API_KEY, and network connection."
      };

      setMessages((current) => [...current, brainMessage]);
    } finally {
      setIsBrainThinking(false);
    }

    if (writeMode && /\b(update|change|edit|mark|move|set|add|revise)\b/i.test(prompt)) {
      const target = findTargetDocument(prompt, documents);

      setChangeRequests((current) => [
        {
          id: `change-${Date.now()}`,
          targetDocumentId: target.id,
          title: `Draft update for ${target.title}`,
          summary: prompt,
          status: "pending"
        },
        ...current
      ]);
    }
  };

  const selectDocument = (document: BrainDocument) => {
    setSelectedDocumentId(document.id);
    setEditText(document.body);
    setActiveView("documents");
  };

  const saveSelectedDocument = () => {
    setDocuments((current) =>
      current.map((document) =>
        document.id === selectedDocument.id
          ? {
            ...document,
            body: editText,
            updatedAt: new Date().toISOString().slice(0, 10)
          }
          : document
      )
    );
  };

  const updateEmployee = (employeeId: string, fields: EmployeeEditState) => {
    setDocuments((current) =>
      current.map((document) => {
        if (document.id !== employeeId) {
          return document;
        }

        const monthlySalaryInr = salaryInputToNumber(fields.currentSalaryRaw);
        const status = fields.status || (fields.dateOfLeaving ? "Exited" : "Active");
        const updatedFields = {
          ...document.fields,
          ...fields,
          monthlySalaryInr,
          status,
          updatedStipendRaw: fields.updatedStipendRaw ?? "",
          oldStipendRaw: fields.oldStipendRaw ?? "",
          offerLetterStatus: (fields.offerLetter || "").trim() ? "Available" : "Missing",
          panCardStatus: (fields.panCard || "").trim() ? "Available" : "Missing",
          aadhaarCardStatus: (fields.aadhaarCard || "").trim() ? "Available" : "Missing",
          bankDetailsStatus: (fields.bankDetails || "").trim() ? "Available" : "Missing",
          bankDetailsDisplay: (fields.bankDetails || "").trim() ? "Captured from portal - protected" : "",
          offerLetterUrl: fields.offerLetterUrl || "",
          panCardUrl: fields.panCardUrl || "",
          aadhaarCardUrl: fields.aadhaarCardUrl || "",
          bankDetailsUrl: fields.bankDetailsUrl || "",
          phone: fields.phone || ""
        };

        // Strip any previous "Portal update:" blocks so they don't accumulate
        const cleanBody = (document.body || "")
          .replace(/\n\nPortal update:[\s\S]*?(?=\n\nPortal update:|$)/g, "")
          .trimEnd();

        return {
          ...document,
          title: `${fields.name || asText(document, "name")} - ${status} Employee`,
          status,
          tags: ["employee", status, "portal-editable"],
          updatedAt: new Date().toISOString().slice(0, 10),
          fields: updatedFields,
          body: `${cleanBody}\n\nPortal update:\n- Employee record edited from Enxt Brain on ${new Date()
            .toISOString()
            .slice(0, 10)}.`
        };
      })
    );
  };

  const addEmployee = (fields: EmployeeEditState) => {
    setDocuments((current) => {
      const monthlySalaryInr = salaryInputToNumber(fields.currentSalaryRaw);
      const newId = `emp-${fields.name?.toLowerCase().replace(/\s+/g, "-") || Date.now()}`;
      
      const newEmployee: BrainDocument = {
        id: newId,
        type: "employee",
        title: `${fields.name || "New Employee"} - Active Employee`,
        status: "Active",
        owner: "Founder Office",
        updatedAt: new Date().toISOString().slice(0, 10),
        tags: ["employee", "Active", "portal-editable"],
        fields: {
          serialNo: `${current.filter(d => d.type === "employee").length + 1}`,
          name: fields.name || "",
          role: "Team Member",
          department: "Enxt AI",
          monthlySalaryInr,
          dateOfJoining: fields.dateOfJoining || new Date().toISOString().slice(0, 10),
          status: "Active",
          pan: fields.panCard || "",
          aadhaar: fields.aadhaarCard || "",
          phone: fields.phone || "",
          email: "",
          location: "",
          reportingTo: "",
          offerLetterStatus: fields.offerLetter?.trim() ? "Available" : "Missing",
          panCardStatus: fields.panCard?.trim() ? "Available" : "Missing",
          aadhaarCardStatus: fields.aadhaarCard?.trim() ? "Available" : "Missing",
          bankDetailsStatus: fields.bankDetails?.trim() ? "Available" : "Missing",
          bankDetailsDisplay: fields.bankDetails?.trim() ? "Captured from portal - protected" : "",
          offerLetterUrl: fields.offerLetterUrl || "",
          panCardUrl: fields.panCardUrl || "",
          aadhaarCardUrl: fields.aadhaarCardUrl || "",
          bankDetailsUrl: fields.bankDetailsUrl || ""
        },
        body: `Portal update:\n- New employee record created from Enxt Brain on ${new Date().toISOString().slice(0, 10)}.`
      };
      
      return [...current, newEmployee];
    });
  };

  const addLead = (fields: LeadEditState) => {
    setDocuments((current) => {
      const potentialValueInr = salaryInputToNumber(fields.potentialValueInr || fields.contractValue);
      const stage = fields.stage || "Old Leads";
      const newId = `lead-${fields.company?.toLowerCase().replace(/\s+/g, "-") || Date.now()}`;
      
      const newLead: BrainDocument = {
        id: newId,
        type: "lead",
        title: fields.company || "New Client",
        status: stage,
        owner: "Sales",
        updatedAt: new Date().toISOString().slice(0, 10),
        tags: ["lead", stage, "portal-editable"],
        fields: {
          ...fields,
          stage,
          potentialValueInr,
          interest: fields.projectDetails,
          nextAction: fields.nextSteps
        },
        body: `Portal update:\n- New lead record created from Enxt Brain on ${new Date().toISOString().slice(0, 10)}.`
      };
      
      return [...current, newLead];
    });
    showToast("Client added successfully", "success");
  };

  const deleteLead = (leadId: string) => {
    setDocuments((current) => current.filter((document) => document.id !== leadId));
    showToast("Client deleted successfully", "success");
  };

  const updateLead = (leadId: string, fields: LeadEditState) => {
    setDocuments((current) =>
      current.map((document) => {
        if (document.id !== leadId) {
          return document;
        }

        const stage = fields.stage || asText(document, "stage") || "Old Leads";
        const potentialValueInr = salaryInputToNumber(fields.potentialValueInr || fields.contractValue);
        const updatedFields = {
          ...document.fields,
          ...fields,
          stage,
          potentialValueInr,
          interest: fields.projectDetails,
          nextAction: fields.nextSteps
        };

        return {
          ...document,
          title: fields.company || document.title,
          status: stage,
          tags: ["lead", stage, "portal-editable"],
          updatedAt: new Date().toISOString().slice(0, 10),
          fields: updatedFields,
          body: `${document.body}\n\nPortal update:\n- Lead record edited from Enxt Brain on ${new Date()
            .toISOString()
            .slice(0, 10)}.`
        };
      })
    );
  };

  const applyChange = (change: ChangeRequest) => {
    setDocuments((current) =>
      current.map((document) =>
        document.id === change.targetDocumentId
          ? {
            ...document,
            body: `${document.body}\n\nFounder-approved AI update:\n- ${change.summary}`,
            updatedAt: new Date().toISOString().slice(0, 10)
          }
          : document
      )
    );
    setChangeRequests((current) =>
      current.map((item) => (item.id === change.id ? { ...item, status: "applied" } : item))
    );
  };

  const rejectChange = (change: ChangeRequest) => {
    setChangeRequests((current) =>
      current.map((item) => (item.id === change.id ? { ...item, status: "rejected" } : item))
    );
  };

  return (
    <div className="app-shell notch-theme">
      {/* Floating Glassmorphic Notch Navbar */}
      <header className="notch-navbar-container">
        <div className="notch-navbar">
          {/* Left: Brand logo & name */}
          <div className="notch-brand" onClick={() => setActiveView("dashboard")}>
            <div className="brand-mark-mini">
              <Bot size={18} aria-hidden="true" />
            </div>
            <span className="brand-name">Enxt Brain</span>
          </div>

          {/* Center: Navigation Links with sliding background highlight */}
          <nav className="notch-nav" ref={navContainerRef} aria-label="Main navigation">
            {activeTabRect && (
              <div 
                className="nav-active-pill" 
                style={{
                  position: 'absolute',
                  left: activeTabRect.left,
                  width: activeTabRect.width,
                  height: activeTabRect.height,
                  top: activeTabRect.top,
                  borderRadius: '999px',
                  backgroundColor: 'var(--green-soft)',
                  border: '1.5px solid rgba(22, 120, 79, 0.25)',
                  transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  zIndex: 0
                }}
              />
            )}
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`notch-nav-item ${activeView === item.id ? 'active' : ''}`}
                  onClick={() => setActiveView(item.id)}
                  type="button"
                  style={{ position: 'relative', zIndex: 1 }}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: Search, Status Indicator Dot, and AI panel toggle */}
          <div className="notch-actions">
            <div className="notch-search">
              <Search size={14} aria-hidden="true" />
              <input
                aria-label="Search memory"
                onChange={(event) => setDocumentQuery(event.target.value)}
                placeholder="Search..."
                value={documentQuery}
              />
            </div>

            <div 
              className="sync-status-pill" 
              title={`${documents.length} docs loaded. Sync state: ${dbSyncStatus}`}
            >
              <span className={`status-dot ${dbSyncStatus}`} />
              <span className="sync-label">
                {dbSyncStatus === 'saving' ? 'saving' : 'synced'}
              </span>
            </div>


          </div>
        </div>
      </header>

      {/* Main shell: contains workspace and AI chat panel */}
      <div className={`content-shell ${isAiPanelOpen ? '' : 'ai-collapsed'}`}>
        <main className="workspace-container" aria-live="polite">
          <div className="view-title-bar">
            <p className="eyebrow">Founder Workspace</p>
            <h2>{getViewTitle(activeView)}</h2>
          </div>

          <div className="workspace-content">
            {activeView === "dashboard" && (
              <DashboardView
                clientValue={clientValue}
                clients={clients}
                employees={employees}
                leads={leads}
                monthlyPayroll={monthlyPayroll}
                pipelineValue={pipelineValue}
                projectBudget={projectBudget}
                projects={projects}
                selectDocument={selectDocument}
              />
            )}

            {activeView === "employees" && (
              <EmployeesView employees={employees} projects={projects} monthlyPayroll={monthlyPayroll} onUpdateEmployee={updateEmployee} onAddEmployee={addEmployee} />
            )}

            {activeView === "projects" && <ProjectsView projects={projects} selectDocument={selectDocument} />}

            {activeView === "crm" && <CrmView leads={leads} onUpdateLead={updateLead} onAddLead={addLead} onDeleteLead={deleteLead} />}

            {activeView === "finance" && (
              <FinanceView />
            )}
            
            {activeView === "documents" && (
              <DocumentsView
                editText={editText}
                filteredDocuments={filteredDocuments}
                onEditText={setEditText}
                onSave={saveSelectedDocument}
                onSelect={selectDocument}
                selectedDocument={selectedDocument}
              />
            )}
            
            {activeView === "tasks" && (
              <>
                <EmployeeTasksView 
                  key={taskRefreshKey} 
                  employees={employees} 
                  onAssignClick={() => setShowTaskModal(true)}
                  onShowToast={(message: string, type: "success" | "error") => {
                    setGlobalToast({ message, type });
                    setTimeout(() => setGlobalToast(null), 5000);
                  }}
                />

                <TaskAssignmentModal 
                  employees={employees} 
                  onTaskCreated={handleTaskCreated} 
                  open={showTaskModal}
                  setOpen={setShowTaskModal}
                  onShowToast={(message: string, type: "success" | "error") => {
                    setGlobalToast({ message, type });
                    setTimeout(() => setGlobalToast(null), 5000);
                  }}
                />
              </>
            )}

            {activeView === "whatsapp" && (
              <div className="h-[600px] w-full max-w-4xl mx-auto">
                <WhatsAppChatView />
              </div>
            )}
          </div>
        </main>

        {/* Right side AI Chat Panel */}
        <aside className={`brain-panel ${isAiPanelOpen ? 'open' : 'collapsed'}`} aria-label="AI chat">
          <div className="brain-panel-header">
            <div>
              <p className="eyebrow">AI system</p>
              <h3>Founder Chat</h3>
            </div>
            <label className="toggle">
              <input checked={writeMode} onChange={(event) => setWriteMode(event.target.checked)} type="checkbox" />
              <span>Write mode</span>
            </label>
          </div>

          <div className="message-list">
            {messages.map((message) => (
              <div className={`message ${message.role}`} key={message.id}>
                <p>{message.content}</p>
              </div>
            ))}
            {isBrainThinking && (
              <div className="message brain">
                <p>Thinking with company memory...</p>
              </div>
            )}
          </div>

          <form className="chat-form" onSubmit={askBrain}>
            <input
              aria-label="Ask Enxt Brain"
              disabled={isBrainThinking}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder={isBrainThinking ? "Enxt Brain is thinking" : "Ask or request a change"}
              value={chatInput}
            />
            <button className="send-button" disabled={isBrainThinking} title="Send" type="submit">
              <Send size={17} aria-hidden="true" />
            </button>
          </form>

          <div className="change-queue">
            <div className="mini-heading">
              <FilePenLine size={16} aria-hidden="true" />
              <span>AI change queue</span>
            </div>
            {changeRequests.length === 0 ? (
              <p className="empty-note">No pending edits.</p>
            ) : (
              changeRequests.slice(0, 4).map((change) => (
                <div className={`change-item ${change.status}`} key={change.id}>
                  <strong>{change.title}</strong>
                  <p>{change.summary}</p>
                  <div className="change-actions">
                    <span>{change.status}</span>
                    {change.status === "pending" && (
                      <div>
                        <button onClick={() => applyChange(change)} title="Approve change" type="button">
                          <Check size={15} aria-hidden="true" />
                        </button>
                        <button onClick={() => rejectChange(change)} title="Reject change" type="button">
                          <X size={15} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
      {/* Mobile Chatbot FAB */}
      <button
        className={`mobile-chat-fab ${isAiPanelOpen ? 'panel-open' : ''}`}
        onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
        title="Toggle AI Chat"
      >
        <span className="fab-tooltip">Ask Enxt Brain</span>
        <span className="fab-icon-wrapper">
          {isAiPanelOpen ? <X size={24} /> : <BotMessageSquare size={24} />}
        </span>
      </button>

      {globalToast && (
        <div 
          className={`whatsapp-toast ${globalToast.type}`} 
          style={{ 
            position: 'fixed', 
            top: '24px', 
            right: '24px', 
            zIndex: 99999, 
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            minWidth: '280px',
            justifyContent: 'space-between'
          }}
        >
          <span>{globalToast.message}</span>
          <button className="icon-button" onClick={() => setGlobalToast(null)} type="button" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );

}

function DashboardView({
  employees,
  projects,
  clients,
  leads,
  monthlyPayroll,
  projectBudget,
  pipelineValue,
  clientValue,
  selectDocument
}: {
  employees: BrainDocument[];
  projects: BrainDocument[];
  clients: BrainDocument[];
  leads: BrainDocument[];
  monthlyPayroll: number;
  projectBudget: number;
  pipelineValue: number;
  clientValue: number;
  selectDocument: (document: BrainDocument) => void;
}) {
  const amberProjects = projects.filter((project) => asText(project, "health") === "Amber");
  const topLeads = [...leads].sort((a, b) => asNumber(b, "potentialValueInr") - asNumber(a, "potentialValueInr")).slice(0, 3);

  return (
    <>
      <section className="metric-grid" aria-label="Company metrics">
        <MetricCard icon={Users} label="Employees" value={`${employees.length}`} detail={`${formatCurrency(monthlyPayroll)} monthly payroll`} />
        <MetricCard icon={SquareKanban} label="AI Projects" value={`${projects.length}`} detail={`${formatCurrency(projectBudget)} scoped budget`} />
        <MetricCard icon={Building2} label="Clients" value={`${clients.length}`} detail={`${formatCurrency(clientValue)} annual value`} />
        <MetricCard icon={BadgeIndianRupee} label="Lead Pipeline" value={formatCurrency(pipelineValue)} detail={`${leads.length} open leads`} />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Watchlist</p>
              <h3>Project Risk</h3>
            </div>
            <Sparkles size={18} aria-hidden="true" />
          </div>
          <div className="stack-list">
            {amberProjects.map((project) => (
              <button className="row-button" key={project.id} onClick={() => selectDocument(project)} type="button">
                <div>
                  <strong>{project.title}</strong>
                  <span>{asText(project, "risk")}</span>
                </div>
                <StatusBadge tone="amber">{asText(project, "health")}</StatusBadge>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Sales</p>
              <h3>Top Open Leads</h3>
            </div>
            <BriefcaseBusiness size={18} aria-hidden="true" />
          </div>
          <div className="stack-list">
            {topLeads.map((lead) => (
              <div className="simple-row" key={lead.id}>
                <div>
                  <strong>{lead.title}</strong>
                  <span>{asText(lead, "nextAction")}</span>
                </div>
                <div className="value-chip">{formatCurrency(asNumber(lead, "potentialValueInr"))}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Operating rhythm</p>
            <h3>Founder Priority Stack</h3>
          </div>
          <MessageSquareText size={18} aria-hidden="true" />
        </div>
        <div className="priority-grid">
          <div>
            <strong>Protect quality</strong>
            <span>Invoice Intelligence, Compliance Brain, and Clinic Voice Notes need tight QA before expansion.</span>
          </div>
          <div>
            <strong>Move pipeline</strong>
            <span>Saffron Bank, Pulse Insurance, and VectorFoods need founder attention this week.</span>
          </div>
          <div>
            <strong>Harden memory</strong>
            <span>Document versioning, write approvals, and Pinecone indexing are the next architecture layer.</span>
          </div>
        </div>
      </section>
    </>
  );
}

function EmployeesView({
  employees,
  projects,
  monthlyPayroll,
  onUpdateEmployee,
  onAddEmployee
}: {
  employees: BrainDocument[];
  projects: BrainDocument[];
  monthlyPayroll: number;
  onUpdateEmployee: (employeeId: string, fields: EmployeeEditState) => void;
  onAddEmployee: (fields: EmployeeEditState) => void;
}) {
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editFields, setEditFields] = useState<EmployeeEditState>({});
  const [viewedDocument, setViewedDocument] = useState<ViewedEmployeeDocument | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [documentFilter, setDocumentFilter] = useState("All");
  const [whatsappToast, setWhatsappToast] = useState<{ message: string; type: "success" | "error" | "loading" } | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const editingEmployee = employees.find((employee) => employee.id === editingEmployeeId);
  const activeCount = employees.filter((employee) => asText(employee, "status") === "Active").length;
  const exitedCount = employees.filter((employee) => asText(employee, "status") === "Exited").length;
  const missingDocsCount = employees.filter((employee) => !hasCompleteEmployeeDocs(employee)).length;
  const filteredEmployees = employees.filter((employee) => {
    const query = employeeSearch.trim().toLowerCase();
    const employeeStatus = asText(employee, "status");
    const matchesSearch =
      !query ||
      `${asText(employee, "name")} ${asText(employee, "department")} ${asText(employee, "dateOfJoining")}`
        .toLowerCase()
        .includes(query);
    const matchesStatus = statusFilter === "All" || employeeStatus === statusFilter;
    const docsComplete = hasCompleteEmployeeDocs(employee);
    const matchesDocs =
      documentFilter === "All" ||
      (documentFilter === "Complete" && docsComplete) ||
      (documentFilter === "Missing" && !docsComplete);

    return matchesSearch && matchesStatus && matchesDocs;
  });

  const startEdit = (employee: BrainDocument) => {
    setEditingEmployeeId(employee.id);
    setEditFields({
      name: asText(employee, "name"),
      status: asText(employee, "status"),
      currentSalaryRaw: asText(employee, "currentSalaryRaw"),
      updatedStipendRaw: asText(employee, "updatedStipendRaw"),
      oldStipendRaw: asText(employee, "oldStipendRaw"),
      dateOfJoining: asText(employee, "dateOfJoining"),
      dateOfLeaving: asText(employee, "dateOfLeaving"),
      offerLetter: asText(employee, "offerLetter"),
      panCard: asText(employee, "panCard"),
      aadhaarCard: asText(employee, "aadhaarCard"),
      bankDetails: asText(employee, "bankDetails"),
      offerLetterUrl: asText(employee, "offerLetterUrl"),
      panCardUrl: asText(employee, "panCardUrl"),
      aadhaarCardUrl: asText(employee, "aadhaarCardUrl"),
      bankDetailsUrl: asText(employee, "bankDetailsUrl"),
      paidFebStipend: asText(employee, "paidFebStipend"),
      paidMarch7: asText(employee, "paidMarch7"),
      paidFeb3: asText(employee, "paidFeb3"),
      paidMay7: asText(employee, "paidMay7"),
      paidJun5: asText(employee, "paidJun5"),
      phone: asText(employee, "phone")
    });
  };

  const updateField = (key: string, value: string) => {
    setEditFields((current) => ({ ...current, [key]: value }));
  };

  const saveEdit = () => {
    if (isAddingNew) {
      onAddEmployee(editFields);
      setIsAddingNew(false);
      setEditFields({});
      return;
    }

    if (!editingEmployeeId) {
      return;
    }

    onUpdateEmployee(editingEmployeeId, editFields);
    setEditingEmployeeId(null);
    setEditFields({});
  };

  const sendWhatsAppPing = async (employee: BrainDocument) => {
    const phone = asText(employee, "phone");
    const name = asText(employee, "name");

    if (!phone) {
      setWhatsappToast({ message: `No phone number for ${name}`, type: "error" });
      setTimeout(() => setWhatsappToast(null), 4000);
      return;
    }

    const missingDocs = [
      asText(employee, "offerLetterStatus") === "Missing" && "Offer Letter",
      asText(employee, "panCardStatus") === "Missing" && "PAN Card",
      asText(employee, "aadhaarCardStatus") === "Missing" && "Aadhaar Card",
      asText(employee, "bankDetailsStatus") === "Missing" && "Bank Details"
    ].filter(Boolean);

    let message: string;
    if (missingDocs.length > 0) {
      message = `Hi ${name}, this is an automated reminder from Enxt AI HR. We are missing the following documents in your profile:\n\n- ${missingDocs.join(
        "\n- "
      )}\n\nPlease submit them to the HR portal at your earliest convenience. Thank you!`;
    } else {
      message = `Hi ${name}, your Enxt AI HR profile is fully complete. Thank you!`;
    }

    setWhatsappToast({ message: `Sending to ${name}...`, type: "success" });

    try {
      const response = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message })
      });

      const data = await response.json();

      if (data.success) {
        const suffix = data.simulated ? " (simulated)" : "";
        setWhatsappToast({ message: `✓ WhatsApp sent to ${name}${suffix}`, type: "success" });
      } else {
        setWhatsappToast({ message: `Failed: ${data.error}`, type: "error" });
      }
    } catch {
      setWhatsappToast({ message: `Network error sending to ${name}`, type: "error" });
    }

    setTimeout(() => setWhatsappToast(null), 5000);
  };

  const runBulkProjectPing = async () => {
    setIsBroadcasting(true);
    const activeEmployees = employees.filter(e => asText(e, "status") === "Active" && asText(e, "phone"));
    
    let sentCount = 0;
    
    for (let i = 0; i < activeEmployees.length; i++) {
      const employee = activeEmployees[i];
      const phone = asText(employee, "phone");
      const name = asText(employee, "name");
      
      setWhatsappToast({ message: `Sending project update to ${name} (${i + 1}/${activeEmployees.length})...`, type: "loading" });

      const assignedProjects = projects.filter((proj) => {
        const owner = asText(proj, "owner").toLowerCase();
        return owner.includes(name.split(" ")[0].toLowerCase());
      });

      let message: string;
      if (assignedProjects.length > 0) {
        const projectLines = assignedProjects.map((proj, idx) => {
          const title = proj.title;
          const phase = asText(proj, "phase");
          const dueDate = asText(proj, "dueDate");
          const progress = asNumber(proj, "progress");
          return `${idx + 1}. *${title}*\n   Phase: ${phase} | Progress: ${progress}%\n   Deadline: ${dueDate}`;
        }).join("\n\n");

        message = `Hi ${name}, here is your automated project update from Enxt AI:\n\n${projectLines}\n\nPlease ensure deadlines are on track. Reach out if you need support!`;
      } else {
        message = `Hi ${name}, this is an automated update from Enxt AI. You currently have no active projects assigned in the system. Contact your manager for new assignments.`;
      }

      try {
        const response = await fetch("/api/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, message })
        });
        if (response.ok) sentCount++;
      } catch (e) {
        console.error("Failed to send bulk project ping to", name, e);
      }

      // Small delay to prevent rate limits
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    
    setIsBroadcasting(false);
    setWhatsappToast({ message: `✓ Broadcast complete! Sent to ${sentCount} employees.`, type: "success" });
    setTimeout(() => setWhatsappToast(null), 5000);
  };

  const runGeneralBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    
    setIsBroadcasting(true);
    const activeEmployees = employees.filter(e => asText(e, "status") === "Active" && asText(e, "phone"));
    
    let sentCount = 0;
    
    for (let i = 0; i < activeEmployees.length; i++) {
      const employee = activeEmployees[i];
      const phone = asText(employee, "phone");
      const name = asText(employee, "name");
      
      setWhatsappToast({ message: `Broadcasting message to ${name} (${i + 1}/${activeEmployees.length})...`, type: "loading" });

      const message = `Hi ${name}, a message from Enxt AI:\n\n${broadcastMessage}`;

      try {
        const response = await fetch("/api/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, message })
        });
        if (response.ok) sentCount++;
      } catch (e) {
        console.error("Failed to send broadcast to", name, e);
      }

      // Small delay to prevent rate limits
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    
    setIsBroadcasting(false);
    setBroadcastMessage("");
    setWhatsappToast({ message: `✓ Broadcast complete! Sent to ${sentCount} employees.`, type: "success" });
    setTimeout(() => setWhatsappToast(null), 5000);
  };

  return (
    <section className="panel fill-panel" style={{ position: 'relative' }}>
      {whatsappToast && (
        <div className={`whatsapp-toast ${whatsappToast.type}`}>
          <span>{whatsappToast.message}</span>
          <button className="icon-button" onClick={() => setWhatsappToast(null)} type="button">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="employee-command">
        <div className="employee-title-block">
          <div>
            <p className="eyebrow">People</p>
            <h3>Employee Registry</h3>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              setIsAddingNew(true);
              setEditFields({});
            }}
            type="button"
          >
            <UserPlus size={16} aria-hidden="true" />
            <span>Add Employee</span>
          </button>
        </div>
        <div className="employee-kpis">
          <div role="button" tabIndex={0} onClick={() => { setStatusFilter("All"); setDocumentFilter("All"); }} style={{ cursor: "pointer" }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setStatusFilter("All"); setDocumentFilter("All"); } }}>
            <span>Total</span>
            <strong><AnimatedValue value={employees.length} /></strong>
          </div>
          <div role="button" tabIndex={0} onClick={() => { setStatusFilter("Active"); setDocumentFilter("All"); }} style={{ cursor: "pointer" }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setStatusFilter("Active"); setDocumentFilter("All"); } }}>
            <span>Active</span>
            <strong><AnimatedValue value={activeCount} /></strong>
          </div>
          <div role="button" tabIndex={0} onClick={() => { setStatusFilter("Exited"); setDocumentFilter("All"); }} style={{ cursor: "pointer" }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setStatusFilter("Exited"); setDocumentFilter("All"); } }}>
            <span>Exited</span>
            <strong><AnimatedValue value={exitedCount} /></strong>
          </div>
          <div role="button" tabIndex={0} onClick={() => { setStatusFilter("All"); setDocumentFilter("All"); }} style={{ cursor: "pointer" }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setStatusFilter("All"); setDocumentFilter("All"); } }}>
            <span>Payroll</span>
            <strong><AnimatedValue value={formatCurrency(monthlyPayroll)} /></strong>
          </div>
          <div role="button" tabIndex={0} onClick={() => { setDocumentFilter("Missing"); }} style={{ cursor: "pointer" }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setDocumentFilter("Missing"); } }}>
            <span>Missing Docs</span>
            <strong><AnimatedValue value={missingDocsCount} /></strong>
          </div>
        </div>

        <div className="employee-automations">
          <p className="eyebrow">WhatsApp Task Automation</p>
          <div className="automations-actions-row">
            <button 
              className="primary-button whatsapp-btn" 
              onClick={runBulkProjectPing} 
              disabled={isBroadcasting}
              type="button"
            >
              <BriefcaseBusiness size={16} aria-hidden="true" />
              <span>Broadcast Project Updates</span>
            </button>
            <div className="announcement-input-group">
              <input 
                value={broadcastMessage}
                onChange={e => setBroadcastMessage(e.target.value)}
                placeholder="Type a company-wide announcement..." 
                disabled={isBroadcasting}
              />
              <button 
                className="primary-button whatsapp-btn" 
                onClick={runGeneralBroadcast} 
                disabled={isBroadcasting || !broadcastMessage.trim()}
                type="button"
              >
                <Send size={16} aria-hidden="true" />
                <span>Broadcast Message</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="employee-filters" aria-label="Employee filters">
        <label className="filter-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search employees"
            onChange={(event) => setEmployeeSearch(event.target.value)}
            placeholder="Search employees"
            value={employeeSearch}
          />
        </label>
        <label className="filter-control">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="All">All</option>
            <option value="Active">Active</option>
            <option value="Exited">Exited</option>
            <option value="On Hold">On Hold</option>
          </select>
        </label>
        <label className="filter-control">
          <span>Documents</span>
          <select value={documentFilter} onChange={(event) => setDocumentFilter(event.target.value)}>
            <option value="All">All</option>
            <option value="Complete">Complete</option>
            <option value="Missing">Missing</option>
          </select>
        </label>
        <button
          className="secondary-button"
          onClick={() => {
            setEmployeeSearch("");
            setStatusFilter("All");
            setDocumentFilter("All");
          }}
          type="button"
        >
          Reset
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Name</th>
              <th>Status</th>
              <th>Salary</th>
              <th>Joined</th>
              <th>Left</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((employee) => (
              <tr key={employee.id}>
                <td>{asText(employee, "serialNo")}</td>
                <td>
                  <strong>{asText(employee, "name")}</strong>
                  <span>{asText(employee, "department")}</span>
                </td>
                <td>
                  <StatusBadge tone={asText(employee, "status") === "Exited" ? "amber" : "green"}>
                    {asText(employee, "status")}
                  </StatusBadge>
                </td>
                <td>{formatCurrency(asNumber(employee, "monthlySalaryInr"))}</td>
                <td>{asText(employee, "dateOfJoining")}</td>
                <td>{presentLabel(asText(employee, "dateOfLeaving"))}</td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="row-action-button" onClick={() => startEdit(employee)} type="button">
                      <Pencil size={15} aria-hidden="true" />
                      <span>Edit</span>
                    </button>
                    {asText(employee, "phone") && asText(employee, "status") === "Active" && (
                      <button
                        className="row-action-button whatsapp-btn"
                        onClick={() => sendWhatsAppPing(employee)}
                        type="button"
                        title="Send missing docs reminder via WhatsApp"
                      >
                        <MessageCircle size={15} aria-hidden="true" />
                        <span>Ping</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredEmployees.length === 0 && (
        <div className="empty-state">
          <strong>No employees match these filters.</strong>
          <span>Try clearing search or switching the status/document filter.</span>
        </div>
      )}

      {mounted && (editingEmployee || isAddingNew) && createPortal(
        <div className="modal-backdrop" role="presentation">
          <div className="employee-edit-panel employee-edit-modal" role="dialog" aria-modal="true" aria-label={isAddingNew ? "Add employee" : "Edit employee"}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Portal edit</p>
                <h3>{isAddingNew ? "Add New Employee" : `Edit ${asText(editingEmployee!, "name")}`}</h3>
              </div>
              <button className="icon-button" onClick={() => { setEditingEmployeeId(null); setIsAddingNew(false); }} title="Close editor" type="button">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="employee-edit-grid">
              <EditableField label="Name" value={editFields.name} onChange={(value) => updateField("name", value)} />
              <label className="field-control">
                <span>Status</span>
                <select value={editFields.status} onChange={(event) => updateField("status", event.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Exited">Exited</option>
                  <option value="On Hold">On Hold</option>
                </select>
              </label>
              <EditableField label="Salary" value={editFields.currentSalaryRaw} onChange={(value) => updateField("currentSalaryRaw", value)} />
              <EditableField label="Date of Joining" value={editFields.dateOfJoining} onChange={(value) => updateField("dateOfJoining", value)} />
              <EditableField label="Date of Leaving" value={editFields.dateOfLeaving} onChange={(value) => updateField("dateOfLeaving", value)} />
              <EditableField label="Offer Letter" value={editFields.offerLetter} onChange={(value) => updateField("offerLetter", value)} />
              <EditableField label="Offer Letter URL" value={editFields.offerLetterUrl} onChange={(value) => updateField("offerLetterUrl", value)} />
              <EditableField label="PAN Card" value={editFields.panCard} onChange={(value) => updateField("panCard", value)} />
              <EditableField label="PAN Card URL" value={editFields.panCardUrl} onChange={(value) => updateField("panCardUrl", value)} />
              <EditableField label="Aadhaar Card" value={editFields.aadhaarCard} onChange={(value) => updateField("aadhaarCard", value)} />
              <EditableField label="Aadhaar Card URL" value={editFields.aadhaarCardUrl} onChange={(value) => updateField("aadhaarCardUrl", value)} />
              <EditableField label="Bank Details" value={editFields.bankDetails} onChange={(value) => updateField("bankDetails", value)} protectedValue />
              <EditableField label="Bank File URL" value={editFields.bankDetailsUrl} onChange={(value) => updateField("bankDetailsUrl", value)} protectedValue />
              <EditableField label="Phone (WhatsApp)" value={editFields.phone} onChange={(value) => updateField("phone", value)} />
            </div>
            <div className="panel-footer">
              <button className="secondary-button" onClick={() => { setEditingEmployeeId(null); setIsAddingNew(false); }} type="button">
                Cancel
              </button>
              <button className="primary-button" onClick={saveEdit} type="button">
                Save Changes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="employee-doc-vault">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Extracted from sheet</p>
            <h3>Employee Document Vault</h3>
          </div>
          <FileText size={18} aria-hidden="true" />
        </div>
        <div className="document-vault-grid">
          {filteredEmployees.map((employee) => (
            <article className="doc-vault-card" key={`${employee.id}-docs`}>
              <div className="doc-vault-header">
                <strong>{asText(employee, "name")}</strong>
                <StatusBadge tone={asText(employee, "status") === "Exited" ? "amber" : "green"}>
                  {asText(employee, "status")}
                </StatusBadge>
              </div>
              <DocumentReference
                employeeName={asText(employee, "name")}
                label="Offer"
                onView={setViewedDocument}
                status={asText(employee, "offerLetterStatus")}
                url={asText(employee, "offerLetterUrl")}
                value={asText(employee, "offerLetter")}
              />
              <DocumentReference
                employeeName={asText(employee, "name")}
                label="PAN"
                onView={setViewedDocument}
                status={asText(employee, "panCardStatus")}
                url={asText(employee, "panCardUrl")}
                value={asText(employee, "panCard")}
              />
              <DocumentReference
                employeeName={asText(employee, "name")}
                label="Aadhaar"
                onView={setViewedDocument}
                status={asText(employee, "aadhaarCardStatus")}
                url={asText(employee, "aadhaarCardUrl")}
                value={asText(employee, "aadhaarCard")}
              />
              <DocumentReference
                employeeName={asText(employee, "name")}
                label="Bank"
                onView={setViewedDocument}
                status={asText(employee, "bankDetailsStatus")}
                url={asText(employee, "bankDetailsUrl")}
                value={asText(employee, "bankDetailsDisplay")}
              />
            </article>
          ))}
        </div>
      </div>

      {viewedDocument && <EmployeeDocumentViewer document={viewedDocument} onClose={() => setViewedDocument(null)} />}
    </section>
  );
}

export function EditableField({
  label,
  value,
  onChange,
  protectedValue = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  protectedValue?: boolean;
}) {
  return (
    <label className="field-control">
      <span>{label}</span>
      <input
        onChange={(event) => onChange(event.target.value)}
        placeholder={protectedValue ? "Protected field" : ""}
        type="text"
        value={value ?? ""}
      />
    </label>
  );
}

function hasCompleteEmployeeDocs(employee: BrainDocument) {
  const requiredStatuses = [
    asText(employee, "panCardStatus"),
    asText(employee, "aadhaarCardStatus"),
    asText(employee, "bankDetailsStatus")
  ];

  return requiredStatuses.every((status) => status === "Available");
}

function DocumentReference({
  employeeName,
  label,
  status,
  value,
  url,
  onView
}: {
  employeeName: string;
  label: string;
  status: string;
  value: string;
  url: string;
  onView: (document: ViewedEmployeeDocument) => void;
}) {
  const available = status === "Available";

  return (
    <div className="doc-ref-row">
      <span>{label}</span>
      <strong className={available ? "available" : "missing"}>{status || "Missing"}</strong>
      <small>{available ? value : "No document reference in sheet"}</small>
      <button
        className="doc-view-button"
        disabled={!available}
        onClick={() => onView({ employeeName, label, status, value, url })}
        title={`View ${label}`}
        type="button"
      >
        <Eye size={14} aria-hidden="true" />
        <span>View</span>
      </button>
    </div>
  );
}

function EmployeeDocumentViewer({
  document: viewedDoc,
  onClose
}: {
  document: ViewedEmployeeDocument;
  onClose: () => void;
}) {
  const previewUrl = getPreviewUrl(viewedDoc.url);

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section className="document-viewer" role="dialog" aria-modal="true" aria-label={`${viewedDoc.label} document viewer`}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{viewedDoc.employeeName}</p>
            <h3>{viewedDoc.label} Document</h3>
          </div>
          <button className="icon-button" onClick={onClose} title="Close document viewer" type="button">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {previewUrl ? (
          <div className="document-preview-frame">
            <iframe src={previewUrl} title={`${viewedDoc.employeeName} ${viewedDoc.label}`} />
            <a href={viewedDoc.url} rel="noreferrer" target="_blank">
              Open original file
            </a>
          </div>
        ) : (
          <div className="document-preview-box">
            <FileText size={42} aria-hidden="true" />
            <strong>{viewedDoc.value}</strong>
            <p>
              This record has a filename from the sheet, but no real file URL yet. Edit the employee and paste the
              Google Drive sharing link into the matching URL field.
            </p>
          </div>
        )}
        <div className="document-viewer-meta">
          <span>Status</span>
          <strong>{viewedDoc.status}</strong>
        </div>
      </section>
    </div>,
    document.body
  );
}

function getPreviewUrl(url: string) {
  const trimmed = url.trim();

  if (!trimmed) {
    return "";
  }

  const driveFileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  const googleDocMatch = trimmed.match(/docs\.google\.com\/document\/d\/([^/]+)/);
  const openFileMatch = trimmed.match(/[?&]id=([^&]+)/);
  const fileId = driveFileMatch?.[1] ?? openFileMatch?.[1];

  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }

  if (googleDocMatch?.[1]) {
    return `https://docs.google.com/document/d/${googleDocMatch[1]}/preview`;
  }

  return trimmed;
}

function ProjectsView({
  projects,
  selectDocument
}: {
  projects: BrainDocument[];
  selectDocument: (document: BrainDocument) => void;
}) {
  return (
    <section className="project-grid">
      {projects.map((project) => (
        <article className="project-card" key={project.id}>
          <div className="project-card-top">
            <div>
              <p className="eyebrow">{asText(project, "client")}</p>
              <h3>{project.title}</h3>
            </div>
            <StatusBadge tone={asText(project, "health") === "Green" ? "green" : "amber"}>{asText(project, "health")}</StatusBadge>
          </div>
          <p>{project.body.split("\n\n")[0].replace("Objective: ", "")}</p>
          <div className="project-meta">
            <span>{asText(project, "phase")}</span>
            <span>{asText(project, "owner")}</span>
            <span>{asText(project, "dueDate")}</span>
          </div>
          <div className="progress-track" aria-label={`${project.title} progress`}>
            <span style={{ width: `${asNumber(project, "progress")}%` }} />
          </div>
          <button className="text-button" onClick={() => selectDocument(project)} type="button">
            Open document
          </button>
        </article>
      ))}
    </section>
  );
}

function CrmView({ leads, onUpdateLead, onAddLead, onDeleteLead }: { leads: BrainDocument[]; onUpdateLead: (leadId: string, fields: LeadEditState) => void; onAddLead: (fields: LeadEditState) => void; onDeleteLead: (leadId: string) => void }) {
  const [leadSearch, setLeadSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [signedFilter, setSignedFilter] = useState("All");
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [expandedLeadIds, setExpandedLeadIds] = useState<string[]>([]);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [isAddingNewLead, setIsAddingNewLead] = useState(false);
  const [leadEditFields, setLeadEditFields] = useState<LeadEditState>({});
  const leadBoardRef = useRef<HTMLElement | null>(null);
  const [boardScroll, setBoardScroll] = useState({ left: 0, max: 0 });
  const editingLead = leads.find((lead) => lead.id === editingLeadId);
  const totalPipeline = leads.reduce((total, lead) => total + asNumber(lead, "potentialValueInr"), 0);
  const projectStartedCount = leads.filter((lead) => asText(lead, "stage") === "Project Started").length;
  const completedCount = leads.filter((lead) => asText(lead, "stage") === "Completed").length;
  const oldLeadCount = leads.filter((lead) => asText(lead, "stage") === "Old Leads").length;
  const filteredLeads = leads.filter((lead) => {
    const query = leadSearch.trim().toLowerCase();
    const stage = asText(lead, "stage");
    const signedStatus = asText(lead, "contractSignedStatus") || "Missing";
    const searchable = `${asText(lead, "company")} ${asText(lead, "contactPerson")} ${asText(
      lead,
      "projectDetails"
    )} ${asText(lead, "communicationStatus")} ${asText(lead, "nextSteps")}`.toLowerCase();

    return (
      (!query || searchable.includes(query)) &&
      (stageFilter === "All" || stage === stageFilter) &&
      (signedFilter === "All" || signedStatus === signedFilter)
    );
  });

  const signedStatuses = Array.from(
    new Set(leads.map((lead) => asText(lead, "contractSignedStatus") || "Missing"))
  ).sort();

  const startLeadEdit = (lead: BrainDocument) => {
    setEditingLeadId(lead.id);
    setLeadEditFields({
      company: asText(lead, "company"),
      contactPerson: asText(lead, "contactPerson"),
      projectDetails: asText(lead, "projectDetails"),
      stage: asText(lead, "stage"),
      contractValue: asText(lead, "contractValue"),
      charge: asText(lead, "charge"),
      paymentDue: asText(lead, "paymentDue"),
      paymentReceived: asText(lead, "paymentReceived"),
      paymentRemarks: asText(lead, "paymentRemarks"),
      contractSignedStatus: asText(lead, "contractSignedStatus"),
      communicationStatus: asText(lead, "communicationStatus"),
      nextSteps: asText(lead, "nextSteps"),
      deadline: asText(lead, "deadline"),
      lastCommunicationDate: asText(lead, "lastCommunicationDate"),
      potentialValueInr: asText(lead, "potentialValueInr")
    });
  };

  const updateLeadField = (key: string, value: string) => {
    setLeadEditFields((current) => ({ ...current, [key]: value }));
  };

  const saveLeadEdit = () => {
    if (isAddingNewLead) {
      onAddLead(leadEditFields);
      setIsAddingNewLead(false);
      setLeadEditFields({});
      return;
    }

    if (!editingLeadId) {
      return;
    }

    onUpdateLead(editingLeadId, leadEditFields);
    setEditingLeadId(null);
    setLeadEditFields({});
  };

  const syncBoardScroll = () => {
    const board = leadBoardRef.current;

    if (!board) {
      return;
    }

    setBoardScroll({
      left: board.scrollLeft,
      max: Math.max(0, board.scrollWidth - board.clientWidth)
    });
  };

  useEffect(() => {
    syncBoardScroll();
  }, [filteredLeads.length, stageFilter, signedFilter, leadSearch]);

  const scrollBoard = (direction: "left" | "right") => {
    const board = leadBoardRef.current;

    if (!board) {
      return;
    }

    board.scrollBy({ left: direction === "left" ? -340 : 340, behavior: "smooth" });
    window.setTimeout(syncBoardScroll, 260);
  };

  const moveLeadToStage = (lead: BrainDocument, stage: string) => {
    onUpdateLead(lead.id, {
      company: asText(lead, "company"),
      contactPerson: asText(lead, "contactPerson"),
      projectDetails: asText(lead, "projectDetails"),
      stage,
      contractValue: asText(lead, "contractValue"),
      charge: asText(lead, "charge"),
      paymentDue: asText(lead, "paymentDue"),
      paymentReceived: asText(lead, "paymentReceived"),
      paymentRemarks: asText(lead, "paymentRemarks"),
      contractSignedStatus: asText(lead, "contractSignedStatus"),
      communicationStatus: asText(lead, "communicationStatus"),
      nextSteps: asText(lead, "nextSteps"),
      deadline: asText(lead, "deadline"),
      lastCommunicationDate: asText(lead, "lastCommunicationDate"),
      potentialValueInr: asText(lead, "potentialValueInr")
    });
  };

  const toggleLeadDetails = (leadId: string) => {
    setExpandedLeadIds((current) =>
      current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId]
    );
  };

  return (
    <>
      <section className="panel crm-leads-panel">
        <div className="employee-command">
          <div className="employee-title-block">
            <div>
              <p className="eyebrow">Pipeline</p>
              <h3>Lead Workspace</h3>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                setIsAddingNewLead(true);
                setLeadEditFields({});
              }}
              type="button"
            >
              <UserPlus size={16} aria-hidden="true" />
              <span>Add Client</span>
            </button>
          </div>
          <div className="employee-kpis">
            <div role="button" tabIndex={0} onClick={() => { setStageFilter("All"); setSignedFilter("All"); }} style={{ cursor: "pointer" }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setStageFilter("All"); setSignedFilter("All"); } }}>
              <span>Total Leads</span>
              <strong><AnimatedValue value={leads.length} /></strong>
            </div>
            <div role="button" tabIndex={0} onClick={() => { setStageFilter("All"); setSignedFilter("All"); }} style={{ cursor: "pointer" }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setStageFilter("All"); setSignedFilter("All"); } }}>
              <span>Pipeline</span>
              <strong><AnimatedValue value={formatCurrency(totalPipeline)} /></strong>
            </div>
            <div role="button" tabIndex={0} onClick={() => { setStageFilter("Project Started"); }} style={{ cursor: "pointer" }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setStageFilter("Project Started"); } }}>
              <span>Started</span>
              <strong><AnimatedValue value={projectStartedCount} /></strong>
            </div>
            <div role="button" tabIndex={0} onClick={() => { setStageFilter("Old Leads"); }} style={{ cursor: "pointer" }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setStageFilter("Old Leads"); } }}>
              <span>Old Leads</span>
              <strong><AnimatedValue value={oldLeadCount} /></strong>
            </div>
            <div role="button" tabIndex={0} onClick={() => { setStageFilter("Completed"); }} style={{ cursor: "pointer" }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setStageFilter("Completed"); } }}>
              <span>Completed</span>
              <strong><AnimatedValue value={completedCount} /></strong>
            </div>
          </div>
        </div>

        <div className="employee-filters" aria-label="Lead filters">
          <label className="filter-search">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Search leads"
              onChange={(event) => setLeadSearch(event.target.value)}
              placeholder="Search company, contact, project"
              value={leadSearch}
            />
          </label>
          <label className="filter-control">
            <span>Stage</span>
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
              <option value="All">All</option>
              {leadStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control">
            <span>Contract</span>
            <select value={signedFilter} onChange={(event) => setSignedFilter(event.target.value)}>
              <option value="All">All</option>
              {signedStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button"
            onClick={() => {
              setLeadSearch("");
              setStageFilter("All");
              setSignedFilter("All");
            }}
            type="button"
          >
            Reset
          </button>
        </div>

        <section
          className="lead-board"
          aria-label="Draggable lead pipeline"
          onScroll={syncBoardScroll}
          ref={leadBoardRef}
        >
          {leadStages.map((stage) => {
            const stageLeads = filteredLeads.filter((lead) => asText(lead, "stage") === stage);
            const stageValue = stageLeads.reduce((total, lead) => total + asNumber(lead, "potentialValueInr"), 0);

            return (
              <div
                className={draggedLeadId ? "lead-stage-column receiving" : "lead-stage-column"}
                key={stage}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const leadId = event.dataTransfer.getData("text/plain") || draggedLeadId;
                  const lead = leads.find((item) => item.id === leadId);

                  if (lead) {
                    moveLeadToStage(lead, stage);
                  }

                  setDraggedLeadId(null);
                }}
              >
                <div className="lead-stage-heading">
                  <div>
                    <span>{stage}</span>
                    <strong>{stageLeads.length}</strong>
                  </div>
                  <small>{stageValue ? formatCurrency(stageValue) : "No value"}</small>
                </div>

                <div className="lead-card-stack">
                  {stageLeads.map((lead) => {
                    const expanded = expandedLeadIds.includes(lead.id);

                    return (
                      <article
                        className={expanded ? "lead-card expanded" : "lead-card"}
                        draggable
                        key={lead.id}
                        onDragEnd={() => setDraggedLeadId(null)}
                        onDragStart={(event) => {
                          setDraggedLeadId(lead.id);
                          event.dataTransfer.setData("text/plain", lead.id);
                        }}
                      >
                        <div className="lead-card-top">
                          <div>
                            <h4>{asText(lead, "company")}</h4>
                            <span>{presentLabel(asText(lead, "contactPerson"))}</span>
                          </div>
                          <div className="lead-card-actions">
                            <button
                              className={expanded ? "icon-button compact lead-card-toggle expanded" : "icon-button compact lead-card-toggle"}
                              onClick={() => toggleLeadDetails(lead.id)}
                              title={expanded ? "Hide lead details" : "Show lead details"}
                              type="button"
                              aria-expanded={expanded}
                            >
                              <ChevronDown size={15} aria-hidden="true" />
                            </button>
                            <button className="icon-button compact" onClick={() => startLeadEdit(lead)} title="Edit lead" type="button">
                              <Pencil size={15} aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <div className="lead-card-details">
                            <div className="lead-card-value">
                              <strong>
                                {asNumber(lead, "potentialValueInr")
                                  ? formatCurrency(asNumber(lead, "potentialValueInr"))
                                  : presentLabel(asText(lead, "contractValue"))}
                              </strong>
                              <span>{presentLabel(asText(lead, "contractSignedStatus"))}</span>
                            </div>

                            <div className="lead-card-section">
                              <span>Project</span>
                              <p>{presentLabel(asText(lead, "projectDetails"))}</p>
                            </div>

                            <div className="lead-card-section">
                              <span>Communication</span>
                              <p>{presentLabel(asText(lead, "communicationStatus"))}</p>
                            </div>

                            <div className="lead-card-section">
                              <span>Next Step</span>
                              <p>{presentLabel(asText(lead, "nextSteps"))}</p>
                            </div>

                            <div className="lead-card-meta">
                              <span>Due: {presentLabel(asText(lead, "deadline"))}</span>
                              <span>Last: {presentLabel(asText(lead, "lastCommunicationDate"))}</span>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}

                  {stageLeads.length === 0 && <div className="lead-empty-drop">Drop leads here</div>}
                </div>
              </div>
            );
          })}
        </section>

        <div className="lead-scroll-controls" aria-label="Pipeline horizontal scroll controls">
          <button onClick={() => scrollBoard("left")} type="button" disabled={boardScroll.left <= 0}>
            <span aria-hidden="true">‹</span>
            Left
          </button>
          <div className="lead-scroll-track">
            <span
              style={{
                width: boardScroll.max > 0 ? `${Math.max(14, 100 / ((boardScroll.max + 1) / 100))}%` : "100%",
                transform:
                  boardScroll.max > 0
                    ? `translateX(${(boardScroll.left / boardScroll.max) * 100}%)`
                    : "translateX(0)"
              }}
            />
          </div>
          <button onClick={() => scrollBoard("right")} type="button" disabled={boardScroll.left >= boardScroll.max - 2}>
            Right
            <span aria-hidden="true">›</span>
          </button>
        </div>

        {filteredLeads.length === 0 && (
          <div className="empty-state">
            <strong>No leads match these filters.</strong>
            <span>Try another stage, signed status, or search term.</span>
          </div>
        )}
      </section>

      {(editingLead || isAddingNewLead) && (
        <div className="modal-backdrop" role="presentation">
          <div className="employee-edit-panel employee-edit-modal" role="dialog" aria-modal="true" aria-label={isAddingNewLead ? "Add client" : "Edit lead"}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Lead edit</p>
                <h3>{isAddingNewLead ? "Add New Client" : `Edit ${asText(editingLead!, "company")}`}</h3>
              </div>
              <button className="icon-button" onClick={() => { setEditingLeadId(null); setIsAddingNewLead(false); }} title="Close editor" type="button">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="employee-edit-grid">
              <EditableField label="Company" value={leadEditFields.company} onChange={(value) => updateLeadField("company", value)} />
              <EditableField label="Contact Person" value={leadEditFields.contactPerson} onChange={(value) => updateLeadField("contactPerson", value)} />
              <EditableField label="Project Details" value={leadEditFields.projectDetails} onChange={(value) => updateLeadField("projectDetails", value)} />
              <label className="field-control">
                <span>Stage</span>
                <select value={leadEditFields.stage} onChange={(event) => updateLeadField("stage", event.target.value)}>
                  {leadStages.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </label>
              <EditableField label="Contract Value" value={leadEditFields.contractValue} onChange={(value) => updateLeadField("contractValue", value)} />
              <EditableField label="Charge" value={leadEditFields.charge} onChange={(value) => updateLeadField("charge", value)} />
              <EditableField label="Payment Due" value={leadEditFields.paymentDue} onChange={(value) => updateLeadField("paymentDue", value)} />
              <EditableField label="Payment Received" value={leadEditFields.paymentReceived} onChange={(value) => updateLeadField("paymentReceived", value)} />
              <EditableField label="Contract Signed Status" value={leadEditFields.contractSignedStatus} onChange={(value) => updateLeadField("contractSignedStatus", value)} />
              <EditableField label="Communication Status" value={leadEditFields.communicationStatus} onChange={(value) => updateLeadField("communicationStatus", value)} />
              <EditableField label="Next Steps" value={leadEditFields.nextSteps} onChange={(value) => updateLeadField("nextSteps", value)} />
              <EditableField label="Deadline" value={leadEditFields.deadline} onChange={(value) => updateLeadField("deadline", value)} />
              <EditableField label="Last Communication" value={leadEditFields.lastCommunicationDate} onChange={(value) => updateLeadField("lastCommunicationDate", value)} />
            </div>
            <div className="editor-footer">
              <span>Saved edits persist in this browser and update the lead pipeline immediately.</span>
              <div className="editor-actions">
                {!isAddingNewLead && editingLeadId && (
                  <button
                    className="secondary-button"
                    style={{ color: "#ef4444", borderColor: "#fca5a5", marginRight: "auto" }}
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete this client?")) {
                        onDeleteLead(editingLeadId);
                        setEditingLeadId(null);
                        setLeadEditFields({});
                      }
                    }}
                    type="button"
                  >
                    Delete client
                  </button>
                )}
                <button className="secondary-button" onClick={() => { setEditingLeadId(null); setIsAddingNewLead(false); }} type="button">
                  Cancel
                </button>
                <button className="primary-button" onClick={saveLeadEdit} type="button">
                  {isAddingNewLead ? "Add client" : "Save lead"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DocumentsView({
  filteredDocuments,
  selectedDocument,
  editText,
  onEditText,
  onSave,
  onSelect
}: {
  filteredDocuments: BrainDocument[];
  selectedDocument: BrainDocument;
  editText: string;
  onEditText: (value: string) => void;
  onSave: () => void;
  onSelect: (document: BrainDocument) => void;
}) {
  return (
    <section className="documents-layout">
      <div className="document-list">
        {filteredDocuments.map((document) => (
          <button
            className={selectedDocument.id === document.id ? "document-item active" : "document-item"}
            key={document.id}
            onClick={() => onSelect(document)}
            type="button"
          >
            <span>{document.type}</span>
            <strong>{document.title}</strong>
            <small>{document.updatedAt}</small>
          </button>
        ))}
      </div>

      <article className="document-editor">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{selectedDocument.type}</p>
            <h3>{selectedDocument.title}</h3>
          </div>
          <StatusBadge tone="neutral">{selectedDocument.status}</StatusBadge>
        </div>
        <div className="doc-tags">
          {selectedDocument.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <textarea aria-label="Document body" onChange={(event) => onEditText(event.target.value)} value={editText} />
        <div className="editor-footer">
          <span>Owner: {selectedDocument.owner}</span>
          <button className="primary-button" onClick={onSave} type="button">
            Save document
          </button>
        </div>
      </article>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-icon">
        <Icon size={18} aria-hidden="true" />
      </div>
      <span>{label}</span>
      <strong><AnimatedValue value={value} /></strong>
      <p>{detail}</p>
    </article>
  );
}

function StatusBadge({ children, tone }: { children: ReactNode; tone: "green" | "amber" | "neutral" }) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

function getViewTitle(view: View) {
  switch (view) {
    case "employees":
      return "Employee Memory";
    case "projects":
      return "AI Project Docs";
    case "crm":
      return "CRM Pipeline";
    case "documents":
      return "Document Store";
    case "tasks":
      return "Employee Tasks";
    case "finance":
      return "Finance Workspace";
    case "whatsapp":
      return "WhatsApp Chat History";
    default:
      return "Command Center";
  }
}

function findTargetDocument(prompt: string, documents: BrainDocument[]) {
  const lowerPrompt = prompt.toLowerCase();
  return (
    documents.find((document) => lowerPrompt.includes(document.title.toLowerCase())) ??
    documents.find((document) => lowerPrompt.includes(asText(document, "company").toLowerCase())) ??
    documents.find((document) => lowerPrompt.includes(asText(document, "name").toLowerCase())) ??
    documents.find((document) => lowerPrompt.includes(document.type)) ??
    documents[0]
  );
}
