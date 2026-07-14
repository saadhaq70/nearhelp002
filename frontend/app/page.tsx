"use client";

import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import HeroSection from "@/components/hero-section";
import AboutSection from "@/components/about-section";
import ServicesSection from "@/components/services-section";
import FaqsSection from "@/components/faqs-section";
import { CtaBanner, Footer } from "@/components/cta-footer";

// ---------------------------------------------------------------------------
// Replace the stubs below with your real auth logic.
// e.g. router.push("/auth/login"), supabase.auth.signIn(), next-auth signIn()
// ---------------------------------------------------------------------------
export default function Home() {
  const router = useRouter();

  return (
    <main className="bg-white font-sans antialiased">
      <Navbar
        isAuthenticated={false}              // ← swap with your session check
        onSignIn={() => router.push("/auth/login")}      // ← your sign-in route
        onGetStarted={() => router.push("/auth/signup")} // ← your signup route
        dashboardHref="/dashboard"
      />
      <HeroSection />
      <AboutSection />
      <ServicesSection />
      <FaqsSection />
      <CtaBanner />
      <Footer />
    </main>
  );
}
