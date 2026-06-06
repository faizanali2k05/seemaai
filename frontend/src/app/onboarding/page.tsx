"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ChevronLeft, ChevronRight, Check, Upload, Plus, X } from "lucide-react";
import apiClient from "@/lib/api";

// Types for form data
interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  pqe?: number;
}

interface OnboardingFormData {
  // Step 1: SRA Details
  sraNumber: string;
  firmName: string;
  address: string;
  phone: string;
  email: string;
  sraLookupAttempted: boolean;

  // Step 2: Staff Import
  staffMembers: StaffMember[];
  importMethod: "csv" | "manual";

  // Step 3: Key Roles
  colpId: string;
  cofaId: string;
  mlroId: string;
  dpoId: string;

  // Step 4: Practice Areas
  practiceAreas: string[];
  firmSize: string;

  // Step 5: Email Preferences
  enableChaseEmails: boolean;
  chaseFrequency: "7" | "14" | "21";
  enableWeeklyDigest: boolean;
  enableRegulatoryAlerts: boolean;
  colpAlertEmail: string;

  // Step 6: Review
  acceptTerms: boolean;
}

const PRACTICE_AREAS = [
  "Conveyancing",
  "Litigation",
  "Family",
  "Criminal",
  "Commercial",
  "Employment",
  "Immigration",
  "Personal Injury",
  "Wills & Probate",
  "Other",
];

const FIRM_SIZES = ["Solo", "2-5", "6-10", "11-25", "26-50", "50+"];

export default function OnboardingWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [csvPreview, setCsvPreview] = useState<StaffMember[]>([]);
  const [manualStaffForm, setManualStaffForm] = useState({
    name: "",
    email: "",
    role: "",
    department: "",
    pqe: "",
  });
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<OnboardingFormData>({
    // Step 1
    sraNumber: "",
    firmName: "",
    address: "",
    phone: "",
    email: "",
    sraLookupAttempted: false,

    // Step 2
    staffMembers: [],
    importMethod: "manual",

    // Step 3
    colpId: "",
    cofaId: "",
    mlroId: "",
    dpoId: "",

    // Step 4
    practiceAreas: [],
    firmSize: "",

    // Step 5
    enableChaseEmails: true,
    chaseFrequency: "14",
    enableWeeklyDigest: true,
    enableRegulatoryAlerts: true,
    colpAlertEmail: "",

    // Step 6
    acceptTerms: false,
  });

  const updateFormData = useCallback(
    (updates: Partial<OnboardingFormData>) => {
      setFormData((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const handleSRALookup = async () => {
    if (!formData.sraNumber.trim()) {
      toast.error("Please enter an SRA number");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiClient.get(`/onboarding/sra-lookup/${encodeURIComponent(formData.sraNumber)}`);
      const data = response.data;
      updateFormData({
        firmName: data.firm_name || "",
        address: data.address || "",
        phone: data.telephone || "",
        email: data.email || "",
        sraLookupAttempted: true,
      });
      toast.success("Firm details loaded successfully");
    } catch (error: any) {
      console.error("SRA lookup error:", error);
      if (error?.response?.status === 404) {
        toast.error("Could not find firm. Please enter details manually.");
      } else {
        toast.error("Error looking up SRA details");
      }
      updateFormData({ sraLookupAttempted: true });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target?.result as string;
        const lines = csv.split("\n").filter((line) => line.trim());

        // Simple CSV parsing (assumes: name, email, role, department, pqe)
        const parsed: StaffMember[] = [];
        for (let i = 1; i < lines.length; i++) {
          const [name, email, role, department, pqe] = lines[i].split(",").map((s) => s.trim());
          if (name && email) {
            parsed.push({
              id: `staff_${Date.now()}_${i}`,
              name,
              email,
              role: role || "",
              department: department || "",
              pqe: pqe ? parseInt(pqe) : undefined,
            });
          }
        }

        if (parsed.length === 0) {
          toast.error("No valid staff records found in CSV");
          return;
        }

        setCsvPreview(parsed);
        updateFormData({ staffMembers: parsed, importMethod: "csv" });
        toast.success(`Imported ${parsed.length} staff members`);
      } catch (error) {
        console.error("CSV parsing error:", error);
        toast.error("Error parsing CSV file");
      }
    };
    reader.readAsText(file);
  };

  const handleAddManualStaff = () => {
    const { name, email, role, department, pqe } = manualStaffForm;

    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }

    const newStaff: StaffMember = {
      id: `staff_${Date.now()}`,
      name,
      email,
      role,
      department,
      pqe: pqe ? parseInt(pqe) : undefined,
    };

    updateFormData({
      staffMembers: [...formData.staffMembers, newStaff],
    });

    setManualStaffForm({ name: "", email: "", role: "", department: "", pqe: "" });
    toast.success("Staff member added");
  };

  const handleRemoveStaff = (staffId: string) => {
    updateFormData({
      staffMembers: formData.staffMembers.filter((s) => s.id !== staffId),
    });
  };

  const togglePracticeArea = (area: string) => {
    updateFormData({
      practiceAreas: formData.practiceAreas.includes(area)
        ? formData.practiceAreas.filter((a) => a !== area)
        : [...formData.practiceAreas, area],
    });
  };

  const handleCompleteSetup = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.post("/onboarding/complete", formData);

      if (response.data) {
        toast.success("Setup complete! Welcome to Seema");
        // Update local user onboarding status so sidebar/redirects work
        const userData = localStorage.getItem("user");
        if (userData) {
          try {
            const user = JSON.parse(userData);
            user.onboarding_status = "complete";
            localStorage.setItem("user", JSON.stringify(user));
          } catch (_) {}
        }
        router.push("/dashboard");
      } else {
        toast.error("Error completing setup");
      }
    } catch (error: any) {
      console.error("Setup error:", error);
      const message = error?.response?.data?.detail || "Error completing onboarding";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const goToStep = (step: number) => {
    setCurrentStep(step);
    window.scrollTo(0, 0);
  };

  const validateStep = (): boolean => {
    const newErrors: Record<string, string> = {};

    switch (currentStep) {
      case 1:
        if (!formData.sraNumber.trim() && !formData.sraLookupAttempted) {
          newErrors.sraNumber = 'Please lookup your SRA number or provide details manually';
        }
        if (!formData.firmName.trim()) {
          newErrors.firmName = 'Firm name is required';
        }
        if (!formData.address.trim()) {
          newErrors.address = 'Address is required';
        }
        if (!formData.phone.trim()) {
          newErrors.phone = 'Phone number is required';
        }
        if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          newErrors.email = 'Please enter a valid email address';
        }
        break;
      case 2:
        if (formData.staffMembers.length === 0) {
          newErrors.staff = 'You must add at least one staff member';
        }
        break;
      case 3:
        if (!formData.colpId) {
          newErrors.colpId = 'COLP is required';
        }
        if (!formData.mlroId) {
          newErrors.mlroId = 'MLRO is required';
        }
        break;
      case 4:
        if (formData.practiceAreas.length === 0) {
          newErrors.practiceAreas = 'Select at least one practice area';
        }
        if (!formData.firmSize) {
          newErrors.firmSize = 'Firm size is required';
        }
        break;
      case 5:
        if (!formData.colpAlertEmail.trim()) {
          newErrors.colpAlertEmail = 'Alert email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.colpAlertEmail)) {
          newErrors.colpAlertEmail = 'Please enter a valid email address';
        }
        break;
      case 6:
        if (!formData.acceptTerms) {
          newErrors.acceptTerms = 'You must accept the terms to proceed';
        }
        break;
    }

    setStepErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Pure check (no setState) for use in disabled props — avoids infinite re-render
  const isStepValid = (): boolean => {
    switch (currentStep) {
      case 1:
        return !!(formData.firmName.trim() && formData.address.trim() && formData.phone.trim() &&
          (!formData.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)));
      case 2:
        return formData.staffMembers.length > 0;
      case 3:
        return !!(formData.colpId && formData.mlroId);
      case 4:
        return formData.practiceAreas.length > 0 && !!formData.firmSize;
      case 5:
        return !!(formData.colpAlertEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.colpAlertEmail));
      case 6:
        return formData.acceptTerms;
      default:
        return true;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Seema Setup</h1>
          </div>
          <p className="text-slate-600 mt-2">Onboard your law firm in 6 steps</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            {[1, 2, 3, 4, 5, 6].map((step) => (
              <React.Fragment key={step}>
                <button
                  onClick={() => goToStep(step)}
                  className={`w-10 h-10 rounded-full font-semibold text-sm flex items-center justify-center transition-all ${
                    step < currentStep
                      ? "bg-green-600 text-white"
                      : step === currentStep
                      ? "bg-blue-600 text-white ring-4 ring-blue-200"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {step < currentStep ? <Check size={18} /> : step}
                </button>
                {step < 6 && (
                  <div
                    className={`flex-1 h-1 mx-2 rounded-full transition-all ${
                      step < currentStep ? "bg-green-600" : "bg-slate-200"
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-600 mt-3">
            <span>SRA Details</span>
            <span>Staff</span>
            <span>Key Roles</span>
            <span>Practice</span>
            <span>Emails</span>
            <span>Review</span>
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          {/* Step 1: SRA Details */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">SRA Firm Details</h2>
                <p className="text-slate-600">
                  Enter your SRA number to auto-fill firm details, or provide them manually.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    SRA Number
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g., 123456"
                      value={formData.sraNumber}
                      onChange={(e) => {
                        updateFormData({ sraNumber: e.target.value });
                        if (stepErrors.sraNumber) setStepErrors({ ...stepErrors, sraNumber: '' });
                      }}
                      className={`flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                        stepErrors.sraNumber ? 'border-red-500' : 'border-slate-300'
                      }`}
                    />
                    <button
                      onClick={handleSRALookup}
                      disabled={isLoading}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {isLoading ? "Looking up..." : "Lookup"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Firm Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Your firm name"
                    value={formData.firmName}
                    onChange={(e) => {
                      updateFormData({ firmName: e.target.value });
                      if (stepErrors.firmName) setStepErrors({ ...stepErrors, firmName: '' });
                    }}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                      stepErrors.firmName ? 'border-red-500' : 'border-slate-300'
                    }`}
                  />
                  {stepErrors.firmName && (
                    <p className="text-red-500 text-xs mt-1">{stepErrors.firmName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Address <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    placeholder="Full office address"
                    value={formData.address}
                    onChange={(e) => {
                      updateFormData({ address: e.target.value });
                      if (stepErrors.address) setStepErrors({ ...stepErrors, address: '' });
                    }}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none h-24 ${
                      stepErrors.address ? 'border-red-500' : 'border-slate-300'
                    }`}
                  />
                  {stepErrors.address && (
                    <p className="text-red-500 text-xs mt-1">{stepErrors.address}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Phone <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="Office number"
                      value={formData.phone}
                      onChange={(e) => {
                        updateFormData({ phone: e.target.value });
                        if (stepErrors.phone) setStepErrors({ ...stepErrors, phone: '' });
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                        stepErrors.phone ? 'border-red-500' : 'border-slate-300'
                      }`}
                    />
                    {stepErrors.phone && (
                      <p className="text-red-500 text-xs mt-1">{stepErrors.phone}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      placeholder="Office email"
                      value={formData.email}
                      onChange={(e) => {
                        updateFormData({ email: e.target.value });
                        if (stepErrors.email) setStepErrors({ ...stepErrors, email: '' });
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                        stepErrors.email ? 'border-red-500' : 'border-slate-300'
                      }`}
                    />
                    {stepErrors.email && (
                      <p className="text-red-500 text-xs mt-1">{stepErrors.email}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Staff Import */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Import Staff</h2>
                <p className="text-slate-600">
                  Add your team members. You can upload a CSV or add them manually.
                </p>
              </div>

              {/* Import Method Tabs */}
              <div className="flex gap-2 border-b border-slate-200">
                <button
                  onClick={() => updateFormData({ importMethod: "csv" })}
                  className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                    formData.importMethod === "csv"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Upload CSV
                </button>
                <button
                  onClick={() => updateFormData({ importMethod: "manual" })}
                  className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                    formData.importMethod === "manual"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Manual Entry
                </button>
              </div>

              {formData.importMethod === "csv" ? (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                    <div className="flex flex-col items-center gap-3">
                      <Upload className="text-slate-400" size={32} />
                      <div>
                        <label className="cursor-pointer">
                          <span className="text-blue-600 font-medium hover:underline">
                            Click to upload
                          </span>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={handleCSVUpload}
                            className="hidden"
                          />
                        </label>
                        <p className="text-slate-600 text-sm mt-1">
                          CSV: name, email, role, department, pqe
                        </p>
                      </div>
                    </div>
                  </div>

                  {csvPreview.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2 text-left text-slate-700 font-medium">
                              Name
                            </th>
                            <th className="px-4 py-2 text-left text-slate-700 font-medium">
                              Email
                            </th>
                            <th className="px-4 py-2 text-left text-slate-700 font-medium">
                              Role
                            </th>
                            <th className="px-4 py-2 text-left text-slate-700 font-medium">
                              Department
                            </th>
                            <th className="px-4 py-2 text-left text-slate-700 font-medium">
                              PQE
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.map((staff) => (
                            <tr key={staff.id} className="border-b border-slate-200">
                              <td className="px-4 py-2">{staff.name}</td>
                              <td className="px-4 py-2">{staff.email}</td>
                              <td className="px-4 py-2">{staff.role}</td>
                              <td className="px-4 py-2">{staff.department}</td>
                              <td className="px-4 py-2">{staff.pqe || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Name"
                      value={manualStaffForm.name}
                      onChange={(e) =>
                        setManualStaffForm({ ...manualStaffForm, name: e.target.value })
                      }
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={manualStaffForm.email}
                      onChange={(e) =>
                        setManualStaffForm({ ...manualStaffForm, email: e.target.value })
                      }
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Role"
                      value={manualStaffForm.role}
                      onChange={(e) =>
                        setManualStaffForm({ ...manualStaffForm, role: e.target.value })
                      }
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Department"
                      value={manualStaffForm.department}
                      onChange={(e) =>
                        setManualStaffForm({ ...manualStaffForm, department: e.target.value })
                      }
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                    <input
                      type="number"
                      placeholder="PQE (years)"
                      value={manualStaffForm.pqe}
                      onChange={(e) =>
                        setManualStaffForm({ ...manualStaffForm, pqe: e.target.value })
                      }
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <button
                    onClick={handleAddManualStaff}
                    className="w-full px-4 py-2 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 font-medium"
                  >
                    <Plus size={18} /> Add Another
                  </button>
                </div>
              )}

              {/* Staff List */}
              {formData.staffMembers.length > 0 && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <h3 className="font-medium text-slate-900 mb-3">
                    Staff Added ({formData.staffMembers.length})
                  </h3>
                  <div className="space-y-2">
                    {formData.staffMembers.map((staff) => (
                      <div
                        key={staff.id}
                        className="flex items-center justify-between bg-white p-3 rounded border border-slate-200"
                      >
                        <div>
                          <p className="font-medium text-slate-900">{staff.name}</p>
                          <p className="text-sm text-slate-600">{staff.email}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveStaff(staff.id)}
                          className="p-1 hover:bg-red-50 rounded text-red-600"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Key Roles */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Assign Key Roles</h2>
                <p className="text-slate-600">
                  Select staff members for critical compliance roles.
                </p>
              </div>

              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-900">
                    <strong>COLP (Compliance Officer for Legal Practice)</strong> and{" "}
                    <strong>MLRO (Money Laundering Reporting Officer)</strong> are required by
                    the SRA.
                  </p>
                </div>

                {/* COLP */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    COLP - Compliance Officer for Legal Practice <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={formData.colpId}
                    onChange={(e) => {
                      updateFormData({ colpId: e.target.value });
                      if (stepErrors.colpId) setStepErrors({ ...stepErrors, colpId: '' });
                    }}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                      stepErrors.colpId ? 'border-red-500' : 'border-slate-300'
                    }`}
                  >
                    <option value="">Select COLP</option>
                    {formData.staffMembers.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                  {stepErrors.colpId && (
                    <p className="text-red-500 text-xs mt-1">{stepErrors.colpId}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    Responsible for compliance with SRA standards and regulations.
                  </p>
                </div>

                {/* COFA */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    COFA - Compliance Officer for Finance & Administration
                  </label>
                  <select
                    value={formData.cofaId}
                    onChange={(e) => updateFormData({ cofaId: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  >
                    <option value="">Select COFA (optional)</option>
                    {formData.staffMembers.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Oversees financial controls and administration compliance.
                  </p>
                </div>

                {/* MLRO */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    MLRO - Money Laundering Reporting Officer <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={formData.mlroId}
                    onChange={(e) => {
                      updateFormData({ mlroId: e.target.value });
                      if (stepErrors.mlroId) setStepErrors({ ...stepErrors, mlroId: '' });
                    }}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                      stepErrors.mlroId ? 'border-red-500' : 'border-slate-300'
                    }`}
                  >
                    <option value="">Select MLRO</option>
                    {formData.staffMembers.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                  {stepErrors.mlroId && (
                    <p className="text-red-500 text-xs mt-1">{stepErrors.mlroId}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    Responsible for detecting and reporting money laundering.
                  </p>
                </div>

                {/* DPO */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    DPO - Data Protection Officer
                  </label>
                  <select
                    value={formData.dpoId}
                    onChange={(e) => updateFormData({ dpoId: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  >
                    <option value="">Select DPO (optional)</option>
                    {formData.staffMembers.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Ensures GDPR compliance and data privacy protection.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Practice Areas */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Practice Areas</h2>
                <p className="text-slate-600">
                  Select the areas of law your firm practices. Tell us your firm size.
                </p>
              </div>

              <div className="space-y-6">
                {/* Practice Areas */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    Areas of Practice <span className="text-red-600">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {PRACTICE_AREAS.map((area) => (
                      <label key={area} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.practiceAreas.includes(area)}
                          onChange={() => {
                            togglePracticeArea(area);
                            if (stepErrors.practiceAreas) setStepErrors({ ...stepErrors, practiceAreas: '' });
                          }}
                          className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-slate-700">{area}</span>
                      </label>
                    ))}
                  </div>
                  {stepErrors.practiceAreas && (
                    <p className="text-red-500 text-xs mt-2">{stepErrors.practiceAreas}</p>
                  )}
                </div>

                {/* Firm Size */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    Firm Size <span className="text-red-600">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {FIRM_SIZES.map((size) => (
                      <button
                        key={size}
                        onClick={() => {
                          updateFormData({ firmSize: size });
                          if (stepErrors.firmSize) setStepErrors({ ...stepErrors, firmSize: '' });
                        }}
                        className={`px-4 py-3 rounded-lg border-2 transition-all font-medium ${
                          formData.firmSize === size
                            ? "border-blue-600 bg-blue-50 text-blue-600"
                            : "border-slate-200 text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        {size} {size === "Solo" ? "" : "lawyers"}
                      </button>
                    ))}
                  </div>
                  {stepErrors.firmSize && (
                    <p className="text-red-500 text-xs mt-2">{stepErrors.firmSize}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Email Preferences */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Email Preferences</h2>
                <p className="text-slate-600">
                  Configure how Seema communicates with you about compliance.
                </p>
              </div>

              <div className="space-y-4">
                {/* Chase Emails */}
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-slate-900">Automated Chase Emails</h3>
                      <p className="text-sm text-slate-600">
                        Remind team members about incomplete tasks
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.enableChaseEmails}
                      onChange={(e) => updateFormData({ enableChaseEmails: e.target.checked })}
                      className="w-6 h-6 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {formData.enableChaseEmails && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Chase Frequency
                      </label>
                      <div className="flex gap-2">
                        {(["7", "14", "21"] as const).map((freq) => (
                          <button
                            key={freq}
                            onClick={() => updateFormData({ chaseFrequency: freq })}
                            className={`px-3 py-2 rounded border-2 text-sm font-medium transition-all ${
                              formData.chaseFrequency === freq
                                ? "border-blue-600 bg-blue-50 text-blue-600"
                                : "border-slate-200 text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            Every {freq} days
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Weekly Digest */}
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-slate-900">Weekly Compliance Digest</h3>
                      <p className="text-sm text-slate-600">
                        Summary of all compliance activities and risks
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.enableWeeklyDigest}
                      onChange={(e) => updateFormData({ enableWeeklyDigest: e.target.checked })}
                      className="w-6 h-6 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Regulatory Alerts */}
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-slate-900">Regulatory Update Alerts</h3>
                      <p className="text-sm text-slate-600">
                        Notifications about new SRA and FCA guidance
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.enableRegulatoryAlerts}
                      onChange={(e) => updateFormData({ enableRegulatoryAlerts: e.target.checked })}
                      className="w-6 h-6 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* COLP Alert Email */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Send Alerts to (Email Address) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="COLP or main contact email"
                    value={formData.colpAlertEmail}
                    onChange={(e) => {
                      updateFormData({ colpAlertEmail: e.target.value });
                      if (stepErrors.colpAlertEmail) setStepErrors({ ...stepErrors, colpAlertEmail: '' });
                    }}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                      stepErrors.colpAlertEmail ? 'border-red-500' : 'border-slate-300'
                    }`}
                  />
                  {stepErrors.colpAlertEmail && (
                    <p className="text-red-500 text-xs mt-1">{stepErrors.colpAlertEmail}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    Primary contact for compliance alerts and digest emails
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Review & Go Live */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Review & Go Live</h2>
                <p className="text-slate-600">
                  Review your setup details below. You can edit any step if needed.
                </p>
              </div>

              <div className="space-y-4">
                {/* Firm Details */}
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-slate-900">Firm Details</h3>
                    <button
                      onClick={() => setCurrentStep(1)}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="text-sm space-y-1 text-slate-700">
                    <p>
                      <strong>Firm:</strong> {formData.firmName}
                    </p>
                    <p>
                      <strong>SRA Number:</strong> {formData.sraNumber || "Not provided"}
                    </p>
                    <p>
                      <strong>Address:</strong> {formData.address}
                    </p>
                    <p>
                      <strong>Phone:</strong> {formData.phone}
                    </p>
                  </div>
                </div>

                {/* Staff */}
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-slate-900">
                      Staff ({formData.staffMembers.length})
                    </h3>
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="text-sm space-y-1 text-slate-700">
                    {formData.staffMembers.slice(0, 3).map((staff) => (
                      <p key={staff.id}>{staff.name}</p>
                    ))}
                    {formData.staffMembers.length > 3 && (
                      <p className="text-slate-600">
                        +{formData.staffMembers.length - 3} more
                      </p>
                    )}
                  </div>
                </div>

                {/* Key Roles */}
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-slate-900">Key Roles</h3>
                    <button
                      onClick={() => setCurrentStep(3)}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="text-sm space-y-1 text-slate-700">
                    <p>
                      <strong>COLP:</strong>{" "}
                      {formData.staffMembers.find((s) => s.id === formData.colpId)?.name || "-"}
                    </p>
                    <p>
                      <strong>MLRO:</strong>{" "}
                      {formData.staffMembers.find((s) => s.id === formData.mlroId)?.name || "-"}
                    </p>
                  </div>
                </div>

                {/* Practice Areas */}
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-slate-900">Practice Areas</h3>
                    <button
                      onClick={() => setCurrentStep(4)}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="text-sm space-y-1 text-slate-700">
                    <p>
                      <strong>Areas:</strong> {formData.practiceAreas.join(", ")}
                    </p>
                    <p>
                      <strong>Size:</strong> {formData.firmSize}
                    </p>
                  </div>
                </div>

                {/* Email Preferences */}
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-slate-900">Email Preferences</h3>
                    <button
                      onClick={() => setCurrentStep(5)}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="text-sm space-y-1 text-slate-700">
                    <p>
                      <strong>Chase Emails:</strong>{" "}
                      {formData.enableChaseEmails ? `Every ${formData.chaseFrequency} days` : "Disabled"}
                    </p>
                    <p>
                      <strong>Alerts to:</strong> {formData.colpAlertEmail}
                    </p>
                  </div>
                </div>
              </div>

              {/* Terms */}
              <div className={`bg-amber-50 border rounded-lg p-4 ${stepErrors.acceptTerms ? 'border-red-500' : 'border-amber-200'}`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.acceptTerms}
                    onChange={(e) => {
                      updateFormData({ acceptTerms: e.target.checked });
                      if (stepErrors.acceptTerms) setStepErrors({ ...stepErrors, acceptTerms: '' });
                    }}
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 mt-1"
                  />
                  <span className={`text-sm ${stepErrors.acceptTerms ? 'text-red-900' : 'text-amber-900'}`}>
                    I agree to Seema's Terms of Service and confirm that all information provided
                    is accurate and complete.
                  </span>
                </label>
                {stepErrors.acceptTerms && (
                  <p className="text-red-500 text-xs mt-2">{stepErrors.acceptTerms}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex gap-4 justify-between">
          <button
            onClick={() => {
              setCurrentStep(Math.max(1, currentStep - 1));
              setStepErrors({});
            }}
            disabled={currentStep === 1}
            className="px-6 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
          >
            <ChevronLeft size={18} />
            Back
          </button>

          {currentStep < 6 ? (
            <button
              onClick={() => {
                if (validateStep()) {
                  setCurrentStep(currentStep + 1);
                  setStepErrors({});
                }
              }}
              disabled={!isStepValid()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
            >
              Next
              <ChevronRight size={18} />
            </button>
          ) : (
            <button
              onClick={handleCompleteSetup}
              disabled={!isStepValid() || isLoading}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
            >
              {isLoading ? "Completing..." : "Complete Setup"}
              <Check size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
