import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { motion } from "framer-motion";
import { AuthProvider } from "./components/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/App.css"; // Updated CSS import path

// Lazy load components to avoid circular dependencies
import { lazy, Suspense } from "react";

const Home = lazy(() => import("./components/Home"));
const ChatRoom = lazy(() => import("./components/ChatRoom"));
const RoomJoin = lazy(() => import("./components/RoomJoin"));
const MeetingRoom = lazy(() => import("./components/MeetingRoom"));
const NotFound = lazy(() => import("./components/NotFound"));
const UserProfile = lazy(() => import("./components/UserProfile"));
const Navbar = lazy(() => import("./components/Navbar"));
const ForgotPassword = lazy(() => import("./components/ForgotPassword"));
const ResetPassword = lazy(() => import("./components/ResetPassword"));

// Auth components
const Auth = lazy(() => import("./components/Auth"));
const Login = lazy(() => import("./components/Auth").then(module => ({ default: module.Login })));
const Register = lazy(() => import("./components/Auth").then(module => ({ default: module.Register })));

// Wrap each page with this component
const AnimatedPage = ({ children }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
};

// Room component without animation
const RoomPage = () => {
  return <ChatRoom />;
};
/*sohamghosh-jellylemonshake-23bps1146 */
// We need this to access location for AnimatePresence
function AnimatedRoutes() {
  const location = useLocation();
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  const [animationKey, setAnimationKey] = useState(location.pathname);

  useEffect(() => {
    // Check if both current and previous paths are room paths
    const isRoomPath = (path) => path.startsWith("/room/");
    const currentIsRoom = isRoomPath(location.pathname);
    const prevIsRoom = isRoomPath(prevPathname);

    // If we're navigating between rooms, use a fixed key to prevent animation
    // Otherwise, use the pathname as key to trigger animation
    if (currentIsRoom && prevIsRoom) {
      setAnimationKey("room-page"); // Fixed key for room changes
    } else {
      setAnimationKey(location.pathname); // Dynamic key for other page changes
    }

    setPrevPathname(location.pathname);
  }, [location.pathname, prevPathname]);

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={animationKey}>
        {/* Pages WITH Navbar */}
        <Route
          path="/"
          element={
            <>
              <Suspense fallback={<div className="loading">Loading...</div>}>
                <Navbar />
              </Suspense>
              <AnimatedPage>
                <Suspense fallback={<div className="loading">Loading...</div>}>
                  <Home />
                </Suspense>
              </AnimatedPage>
            </>
          }
        />

        <Route
          path="/login"
          element={
            <>
              <Suspense fallback={<div className="loading">Loading...</div>}>
                <Navbar />
              </Suspense>
              <AnimatedPage>
                <div className="content-container">
                  <Suspense fallback={<div className="loading">Loading...</div>}>
                    <Login />
                  </Suspense>
                </div>
              </AnimatedPage>
            </>
          }
        />

        <Route
          path="/register"
          element={
            <>
              <Suspense fallback={<div className="loading">Loading...</div>}>
                <Navbar />
              </Suspense>
              <AnimatedPage>
                <div className="content-container">
                  <Suspense fallback={<div className="loading">Loading...</div>}>
                    <Register />
                  </Suspense>
                </div>
              </AnimatedPage>
            </>
          }
        />

        <Route
          path="/forgot-password"
          element={
            <>
              <Suspense fallback={<div className="loading">Loading...</div>}>
                <Navbar />
              </Suspense>
              <AnimatedPage>
                <div className="content-container">
                  <Suspense fallback={<div className="loading">Loading...</div>}>
                    <ForgotPassword />
                  </Suspense>
                </div>
              </AnimatedPage>
            </>
          }
        />

        <Route
          path="/reset-password"
          element={
            <>
              <Suspense fallback={<div className="loading">Loading...</div>}>
                <Navbar />
              </Suspense>
              <AnimatedPage>
                <div className="content-container">
                  <Suspense fallback={<div className="loading">Loading...</div>}>
                    <ResetPassword />
                  </Suspense>
                </div>
              </AnimatedPage>
            </>
          }
        />

        <Route
          path="/profile"
          element={
            <>
              <Suspense fallback={<div className="loading">Loading...</div>}>
                <Navbar />
              </Suspense>
              <AnimatedPage>
                <div className="content-container">
                  <Suspense fallback={<div className="loading">Loading...</div>}>
                    <UserProfile />
                  </Suspense>
                </div>
              </AnimatedPage>
            </>
          }
        />

        <Route
          path="/join"
          element={
            <>
              <Suspense fallback={<div className="loading">Loading...</div>}>
                <Navbar />
              </Suspense>
              <AnimatedPage>
                <div className="content-container">
                  <Suspense fallback={<div className="loading">Loading...</div>}>
                    <RoomJoin />
                  </Suspense>
                </div>
              </AnimatedPage>
            </>
          }
        />

        {/* Room route without AnimatedPage wrapper for instant room changes */}
        <Route path="/room/:roomId" element={
          <Suspense fallback={<div className="loading">Loading...</div>}>
            <RoomPage />
          </Suspense>
        } />

        {/* Meeting route */}
        <Route path="/meet/:meetingId" element={
          <Suspense fallback={<div className="loading">Loading...</div>}>
            <MeetingRoom />
          </Suspense>
        } />

        <Route
          path="*"
          element={
            <Suspense fallback={<div className="loading">Loading...</div>}>
              <NotFound />
            </Suspense>
          }
        />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <div className="app-container">
            <AnimatedRoutes />
          </div>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
