import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const Home = lazy(() => import("@/pages/Home"));
const Services = lazy(() => import("@/pages/Services"));
const ServiceDetail = lazy(() => import("@/pages/ServiceDetail"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const Dashboard = lazy(() => import("@/pages/customer/Dashboard"));
const BookingForm = lazy(() => import("@/pages/customer/BookingForm"));
const BookingDetail = lazy(() => import("@/pages/customer/BookingDetail"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const ManageBookings = lazy(() => import("@/pages/admin/ManageBookings"));
const AdminBookingDetail = lazy(() => import("@/pages/admin/AdminBookingDetail"));
const ManageServices = lazy(() => import("@/pages/admin/ManageServices"));
const ManagePayments = lazy(() => import("@/pages/admin/ManagePayments"));
const ManageStaff = lazy(() => import("@/pages/admin/ManageStaff"));
const StaffDashboard = lazy(() => import("@/pages/staff/StaffDashboard"));
const JobDetail = lazy(() => import("@/pages/staff/JobDetail"));

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
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/services" element={<Services />} />
            <Route path="/services/:id" element={<ServiceDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            <Route path="/dashboard" element={<Protected roles={["customer"]}><Dashboard /></Protected>} />
            <Route path="/book/:serviceId" element={<Protected roles={["customer"]}><BookingForm /></Protected>} />
            <Route path="/bookings/:id" element={<Protected roles={["customer"]}><BookingDetail /></Protected>} />

            <Route path="/admin" element={<Protected roles={["admin"]}><AdminDashboard /></Protected>} />
            <Route path="/admin/bookings" element={<Protected roles={["admin"]}><ManageBookings /></Protected>} />
            <Route path="/admin/bookings/:id" element={<Protected roles={["admin"]}><AdminBookingDetail /></Protected>} />
            <Route path="/admin/services" element={<Protected roles={["admin"]}><ManageServices /></Protected>} />
            <Route path="/admin/payments" element={<Protected roles={["admin"]}><ManagePayments /></Protected>} />
            <Route path="/admin/staff" element={<Protected roles={["admin"]}><ManageStaff /></Protected>} />

            <Route path="/staff" element={<Protected roles={["staff"]}><StaffDashboard /></Protected>} />
            <Route path="/staff/jobs/:id" element={<Protected roles={["staff"]}><JobDetail /></Protected>} />

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
    </div>
  );
}
