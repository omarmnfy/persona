"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { validatePassword } from "@/lib/password";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SCHOOL_OPTIONS } from "@/lib/personaCatalog";

export default function SignupPage() {
  return (
    <main className="min-h-screen px-6 py-12 flex items-center justify-center bg-slate-50">
      <div className="mx-auto max-w-lg text-center">
        <div className="rounded-3xl bg-white p-12 shadow-xl ring-1 ring-slate-200">
          <div className="h-16 w-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Invite-only Access</h1>
          <p className="text-slate-600 mb-8">
            Registration is currently restricted to invited participants. If you have received an invite email, please follow the link provided there to complete your profile.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center font-semibold text-indigo-600 hover:text-indigo-500"
          >
            Go to login
            <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
