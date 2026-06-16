import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { ScrollToTop } from "@/components/ScrollToTop";

// Public
const Home = lazy(() => import("@/pages/Home"));
const Services = lazy(() => import("@/pages/Services"));
const ServiceDetail = lazy(() => import("@/pages/ServiceDetail"));
const GovtJobs = lazy(() => import("@/pages/GovtJobs"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));

// Customer
const Dashboard = lazy(() => import("@/pages/customer/Dashboard"));
const NewRequest = lazy(() => import("@/pages/customer/NewRequest"));
const RequestDetail = lazy(() => import("@/pages/customer/RequestDetail"));

// Agent
const AgentDashboard = lazy(() => import("@/pages/agent/AgentDashboard"));
const TaskDetail = lazy(() => import("@/pages/agent/TaskDetail"));

// Admin
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminRequests = lazy(() => import("@/pages/admin/AdminRequests"));
const AdminRequestDetail = lazy(() => import("@/pages/admin/AdminRequestDetail"));
const AdminCustomers = lazy(() => import("@/pages/admin/AdminCustomers"));
const AdminAgents = lazy(() => import("@/pages/admin/AdminAgents"));
const AdminPayments = lazy(() => import("@/pages/admin/AdminPayments"));
const AdminServices = lazy(() => import("@/pages/admin/AdminServices"));
const AdminReports = lazy(() => import("@/pages/admin/AdminReports"));
const AdminAudit = lazy(() => import("@/pages/admin/AdminAudit"));

function Protected({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const Loader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
  </div>
);

export default function App() {
  return (
    <div className="flex flex-col min-h-screen">
      <ScrollToTop />
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<Loader />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Home />} />
            <Route path="/services" element={<Services />} />
            <Route path="/services/:id" element={<ServiceDetail />} />
            <Route path="/jobs" element={<GovtJobs />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            {/* Customer */}
            <Route path="/dashboard" element={<Protected roles={["customer"]}><Dashboard /></Protected>} />
            <Route path="/new-request" element={<Protected roles={["customer"]}><NewRequest /></Protected>} />
            <Route path="/new-request/:serviceId" element={<Protected roles={["customer"]}><NewRequest /></Protected>} />
            <Route path="/requests/:id" element={<Protected roles={["customer"]}><RequestDetail /></Protected>} />

            {/* Agent */}
            <Route path="/agent" element={<Protected roles={["agent"]}><AgentDashboard /></Protected>} />
            <Route path="/agent/tasks/:id" element={<Protected roles={["agent"]}><TaskDetail /></Protected>} />

            {/* Admin */}
            <Route path="/admin" element={<Protected roles={["admin"]}><AdminDashboard /></Protected>} />
            <Route path="/admin/requests" element={<Protected roles={["admin"]}><AdminRequests /></Protected>} />
            <Route path="/admin/requests/:id" element={<Protected roles={["admin"]}><AdminRequestDetail /></Protected>} />
            <Route path="/admin/customers" element={<Protected roles={["admin"]}><AdminCustomers /></Protected>} />
            <Route path="/admin/agents" element={<Protected roles={["admin"]}><AdminAgents /></Protected>} />
            <Route path="/admin/payments" element={<Protected roles={["admin"]}><AdminPayments /></Protected>} />
            <Route path="/admin/services" element={<Protected roles={["admin"]}><AdminServices /></Protected>} />
            <Route path="/admin/reports" element={<Protected roles={["admin"]}><AdminReports /></Protected>} />
            <Route path="/admin/audit" element={<Protected roles={["admin"]}><AdminAudit /></Protected>} />

            <Route path="*" element={
              <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-4xl font-bold text-muted-foreground/30 mb-1">404</h1>
                <p className="text-muted-foreground">Page not found</p>
              </div>
            } />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
