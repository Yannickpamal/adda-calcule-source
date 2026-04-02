import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Calculator,
  Download,
  Euro,
  Percent,
  Clock,
  TrendingDown,
  Banknote,
  PiggyBank,
  Sun,
  Moon,
  Smartphone,
  X,
  CalendarDays,
  Home as HomeIcon,
  Building2,
  CreditCard,
  RefreshCw,
  GraduationCap,
  ArrowRightLeft,
  Landmark,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Wallet,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Gauge,
} from "lucide-react";
import { generatePDF } from "@/lib/generate-pdf";
import logoSrc from "@assets/logo.jpeg";

// ─── Types ──────────────────────────────────────────────────────────────

export type LoanType =
  | "immobilier"
  | "consommation"
  | "renouvelable"
  | "etudiant"
  | "relais"
  | "in_fine";

interface LoanTypeConfig {
  label: string;
  icon: any;
  description: string;
  hasInsurance: boolean;
  hasDeferral: boolean; // différé de remboursement
  defaultRate: number;
  defaultDuration: number;
  minDuration: number;
  maxDuration: number;
  minAmount: number;
  maxAmount: number;
}

export const LOAN_TYPES: Record<LoanType, LoanTypeConfig> = {
  immobilier: {
    label: "Crédit immobilier",
    icon: HomeIcon,
    description: "Taux fixe, assurance incluse",
    hasInsurance: true,
    hasDeferral: false,
    defaultRate: 3.5,
    defaultDuration: 20,
    minDuration: 5,
    maxDuration: 30,
    minAmount: 20000,
    maxAmount: 1000000,
  },
  consommation: {
    label: "Crédit à la consommation",
    icon: CreditCard,
    description: "Prêt personnel ou affecté",
    hasInsurance: true,
    hasDeferral: false,
    defaultRate: 5.5,
    defaultDuration: 5,
    minDuration: 1,
    maxDuration: 10,
    minAmount: 1000,
    maxAmount: 75000,
  },
  renouvelable: {
    label: "Crédit renouvelable",
    icon: RefreshCw,
    description: "Capital revolving",
    hasInsurance: false,
    hasDeferral: false,
    defaultRate: 15.0,
    defaultDuration: 3,
    minDuration: 1,
    maxDuration: 5,
    minAmount: 500,
    maxAmount: 6000,
  },
  etudiant: {
    label: "Prêt étudiant",
    icon: GraduationCap,
    description: "Taux préférentiel, différé possible",
    hasInsurance: true,
    hasDeferral: true,
    defaultRate: 1.0,
    defaultDuration: 8,
    minDuration: 2,
    maxDuration: 12,
    minAmount: 1000,
    maxAmount: 120000,
  },
  relais: {
    label: "Prêt relais",
    icon: ArrowRightLeft,
    description: "Durée courte, mensualités réduites",
    hasInsurance: true,
    hasDeferral: false,
    defaultRate: 3.8,
    defaultDuration: 2,
    minDuration: 1,
    maxDuration: 3,
    minAmount: 20000,
    maxAmount: 500000,
  },
  in_fine: {
    label: "Prêt in fine",
    icon: Landmark,
    description: "Capital remboursé à la fin",
    hasInsurance: true,
    hasDeferral: false,
    defaultRate: 3.2,
    defaultDuration: 15,
    minDuration: 5,
    maxDuration: 25,
    minAmount: 20000,
    maxAmount: 1000000,
  },
};

export interface AmortizationRow {
  month: number;
  date: string; // "MM/YYYY"
  payment: number;
  principal: number;
  interest: number;
  insurance: number;
  remainingBalance: number;
}

export interface YearSummary {
  year: number;
  totalPayment: number;
  totalPrincipal: number;
  totalInterest: number;
  totalInsurance: number;
  remainingBalance: number;
  monthCount: number;
}

export interface LoanSummary {
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  totalInsurance: number;
  totalCost: number;
}

export interface ExistingLoan {
  id: string;
  label: string;
  monthlyPayment: number;
}

export interface RentalIncome {
  id: string;
  label: string;
  grossMonthlyRent: number;
}

export interface DebtRatioData {
  monthlyIncome: number;
  rentalIncomes: RentalIncome[];
  rentalWeighting: number;
  totalWeightedRental: number;
  totalEffectiveIncome: number;
  existingLoans: ExistingLoan[];
  newLoanPayment: number;
  totalMonthlyDebt: number;
  debtRatio: number;
  verdict: "ok" | "warning" | "danger";
}

// ─── Date helpers ──────────────────────────────────────────────────────

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatDateFR(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${m}/${y}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "percent",
    minimumFractionDigits: 2,
  }).format(value / 100);
}

// ─── Compute ──────────────────────────────────────────────────────────

interface ComputeResult {
  schedule: AmortizationRow[];
  summary: LoanSummary;
  yearSummaries: YearSummary[];
}

function computeAmortization(
  loanType: LoanType,
  amount: number,
  rate: number,
  duration: number,
  insuranceRate: number,
  startDate: Date,
  deferralMonths: number
): ComputeResult {
  const config = LOAN_TYPES[loanType];
  const totalMonths = duration * 12;
  const monthlyRate = rate / 100 / 12;
  const monthlyInsurance = config.hasInsurance
    ? (amount * (insuranceRate / 100)) / 12
    : 0;

  const rows: AmortizationRow[] = [];
  let balance = amount;
  let totalInterest = 0;
  let totalInsuranceTotal = 0;

  if (loanType === "in_fine") {
    // Prêt in fine: on ne rembourse que les intérêts pendant la durée,
    // puis le capital en totalité à la dernière échéance
    for (let i = 1; i <= totalMonths; i++) {
      const paymentDate = addMonths(startDate, i);
      const interestPart = balance * monthlyRate;
      const isLast = i === totalMonths;
      const principalPart = isLast ? amount : 0;
      const currentBalance = isLast ? 0 : balance;
      const payment = interestPart + monthlyInsurance + principalPart;

      totalInterest += interestPart;
      totalInsuranceTotal += monthlyInsurance;

      rows.push({
        month: i,
        date: formatDateFR(paymentDate),
        payment,
        principal: principalPart,
        interest: interestPart,
        insurance: monthlyInsurance,
        remainingBalance: currentBalance,
      });
    }
  } else if (loanType === "relais") {
    // Prêt relais: on ne rembourse que les intérêts (+ assurance),
    // capital remboursé en totalité à la fin (comme in fine mais durée courte)
    for (let i = 1; i <= totalMonths; i++) {
      const paymentDate = addMonths(startDate, i);
      const interestPart = balance * monthlyRate;
      const isLast = i === totalMonths;
      const principalPart = isLast ? amount : 0;
      const currentBalance = isLast ? 0 : balance;
      const payment = interestPart + monthlyInsurance + principalPart;

      totalInterest += interestPart;
      totalInsuranceTotal += monthlyInsurance;

      rows.push({
        month: i,
        date: formatDateFR(paymentDate),
        payment,
        principal: principalPart,
        interest: interestPart,
        insurance: monthlyInsurance,
        remainingBalance: currentBalance,
      });
    }
  } else if (loanType === "etudiant" && deferralMonths > 0) {
    // Prêt étudiant avec différé: pendant le différé, on ne paie que les intérêts
    // Puis amortissement classique sur la durée restante
    const repaymentMonths = totalMonths - deferralMonths;

    // Phase de différé
    for (let i = 1; i <= deferralMonths; i++) {
      const paymentDate = addMonths(startDate, i);
      const interestPart = balance * monthlyRate;
      const payment = interestPart + monthlyInsurance;
      totalInterest += interestPart;
      totalInsuranceTotal += monthlyInsurance;

      rows.push({
        month: i,
        date: formatDateFR(paymentDate),
        payment,
        principal: 0,
        interest: interestPart,
        insurance: monthlyInsurance,
        remainingBalance: balance,
      });
    }

    // Phase de remboursement
    let monthlyPayment: number;
    if (monthlyRate === 0) {
      monthlyPayment = balance / repaymentMonths;
    } else {
      monthlyPayment =
        (balance *
          monthlyRate *
          Math.pow(1 + monthlyRate, repaymentMonths)) /
        (Math.pow(1 + monthlyRate, repaymentMonths) - 1);
    }

    for (let i = deferralMonths + 1; i <= totalMonths; i++) {
      const paymentDate = addMonths(startDate, i);
      const interestPart = balance * monthlyRate;
      const principalPart = monthlyPayment - interestPart;
      balance = Math.max(0, balance - principalPart);
      totalInterest += interestPart;
      totalInsuranceTotal += monthlyInsurance;

      rows.push({
        month: i,
        date: formatDateFR(paymentDate),
        payment: monthlyPayment + monthlyInsurance,
        principal: principalPart,
        interest: interestPart,
        insurance: monthlyInsurance,
        remainingBalance: balance,
      });
    }
  } else {
    // Crédit classique (immobilier, consommation, renouvelable, étudiant sans différé)
    let monthlyPayment: number;
    if (monthlyRate === 0) {
      monthlyPayment = amount / totalMonths;
    } else {
      monthlyPayment =
        (amount *
          monthlyRate *
          Math.pow(1 + monthlyRate, totalMonths)) /
        (Math.pow(1 + monthlyRate, totalMonths) - 1);
    }

    for (let i = 1; i <= totalMonths; i++) {
      const paymentDate = addMonths(startDate, i);
      const interestPart = balance * monthlyRate;
      const principalPart = monthlyPayment - interestPart;
      balance = Math.max(0, balance - principalPart);
      totalInterest += interestPart;
      totalInsuranceTotal += monthlyInsurance;

      rows.push({
        month: i,
        date: formatDateFR(paymentDate),
        payment: monthlyPayment + monthlyInsurance,
        principal: principalPart,
        interest: interestPart,
        insurance: monthlyInsurance,
        remainingBalance: balance,
      });
    }
  }

  const totalPayment = rows.reduce((s, r) => s + r.payment, 0);

  // Compute first monthly payment for display (typical)
  const displayMonthly =
    rows.length > 0
      ? loanType === "in_fine" || loanType === "relais"
        ? rows[0].payment
        : loanType === "etudiant" && deferralMonths > 0 && rows.length > deferralMonths
        ? rows[deferralMonths].payment
        : rows[0].payment
      : 0;

  const summaryData: LoanSummary = {
    monthlyPayment: displayMonthly,
    totalPayment,
    totalInterest,
    totalInsurance: totalInsuranceTotal,
    totalCost: totalInterest + totalInsuranceTotal,
  };

  // Build year summaries from rows grouped by calendar year
  const yearMap = new Map<number, YearSummary>();
  rows.forEach((row) => {
    const yearStr = row.date.split("/")[1];
    const year = parseInt(yearStr, 10);
    if (!yearMap.has(year)) {
      yearMap.set(year, {
        year,
        totalPayment: 0,
        totalPrincipal: 0,
        totalInterest: 0,
        totalInsurance: 0,
        remainingBalance: 0,
        monthCount: 0,
      });
    }
    const ys = yearMap.get(year)!;
    ys.totalPayment += row.payment;
    ys.totalPrincipal += row.principal;
    ys.totalInterest += row.interest;
    ys.totalInsurance += row.insurance;
    ys.remainingBalance = row.remainingBalance;
    ys.monthCount += 1;
  });

  const yearSummaries = Array.from(yearMap.values()).sort(
    (a, b) => a.year - b.year
  );

  return { schedule: rows, summary: summaryData, yearSummaries };
}

// ─── Component ────────────────────────────────────────────────────────

export default function Home() {
  const [loanType, setLoanType] = useState<LoanType>("immobilier");
  const [amount, setAmount] = useState<number>(200000);
  const [rate, setRate] = useState<number>(3.5);
  const [duration, setDuration] = useState<number>(20);
  const [insuranceRate, setInsuranceRate] = useState<number>(0.34);
  const [deferralMonths, setDeferralMonths] = useState<number>(0);
  const [startDateStr, setStartDateStr] = useState<string>(() => {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${m}-01`;
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());
  const deferredPromptRef = useRef<any>(null);

  // ─── Debt ratio state ───────────────────────────────────────────
  const [monthlyIncome, setMonthlyIncome] = useState<number>(3500);
  const [rentalIncomes, setRentalIncomes] = useState<RentalIncome[]>([]);
  const [rentalWeighting, setRentalWeighting] = useState<number>(70);
  const [existingLoans, setExistingLoans] = useState<ExistingLoan[]>([]);

  const addExistingLoan = () => {
    setExistingLoans((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: "", monthlyPayment: 0 },
    ]);
  };

  const removeExistingLoan = (id: string) => {
    setExistingLoans((prev) => prev.filter((l) => l.id !== id));
  };

  const updateExistingLoan = (id: string, field: keyof Omit<ExistingLoan, "id">, value: string | number) => {
    setExistingLoans((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  const addRentalIncome = () => {
    setRentalIncomes((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: "", grossMonthlyRent: 0 },
    ]);
  };

  const removeRentalIncome = (id: string) => {
    setRentalIncomes((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRentalIncome = (id: string, field: keyof Omit<RentalIncome, "id">, value: string | number) => {
    setRentalIncomes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const config = LOAN_TYPES[loanType];

  // When loan type changes, reset parameters to type defaults
  useEffect(() => {
    const c = LOAN_TYPES[loanType];
    setRate(c.defaultRate);
    setDuration(c.defaultDuration);
    if (amount < c.minAmount) setAmount(c.minAmount);
    if (amount > c.maxAmount) setAmount(c.maxAmount);
    if (!c.hasInsurance) setInsuranceRate(0);
    else if (insuranceRate === 0) setInsuranceRate(0.34);
    if (!c.hasDeferral) setDeferralMonths(0);
  }, [loanType]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () =>
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  const handleInstall = async () => {
    if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt();
      const result = await deferredPromptRef.current.userChoice;
      if (result.outcome === "accepted") {
        setShowInstallBanner(false);
      }
      deferredPromptRef.current = null;
    }
  };

  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  );

  const toggleDark = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  }, []);

  useState(() => {
    document.documentElement.classList.toggle("dark", isDark);
  });

  const startDate = useMemo(() => {
    const parts = startDateStr.split("-");
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2] || "1"));
  }, [startDateStr]);

  const { schedule, summary, yearSummaries } = useMemo(() => {
    return computeAmortization(
      loanType,
      amount,
      rate,
      duration,
      insuranceRate,
      startDate,
      deferralMonths
    );
  }, [loanType, amount, rate, duration, insuranceRate, startDate, deferralMonths]);

  // ─── Debt ratio calculation ─────────────────────────────────────────
  const debtRatio = useMemo<DebtRatioData>(() => {
    const existingTotal = existingLoans.reduce((s, l) => s + (l.monthlyPayment || 0), 0);
    const newPayment = summary.monthlyPayment;
    const totalDebt = existingTotal + newPayment;
    // Revenus locatifs pondérés
    const grossRentalTotal = rentalIncomes.reduce((s, r) => s + (r.grossMonthlyRent || 0), 0);
    const totalWeightedRental = grossRentalTotal * (rentalWeighting / 100);
    const totalEffectiveIncome = monthlyIncome + totalWeightedRental;
    const ratio = totalEffectiveIncome > 0 ? (totalDebt / totalEffectiveIncome) * 100 : 0;
    let verdict: "ok" | "warning" | "danger" = "ok";
    if (ratio > 35) verdict = "danger";
    else if (ratio > 30) verdict = "warning";
    return {
      monthlyIncome,
      rentalIncomes,
      rentalWeighting,
      totalWeightedRental,
      totalEffectiveIncome,
      existingLoans,
      newLoanPayment: newPayment,
      totalMonthlyDebt: totalDebt,
      debtRatio: ratio,
      verdict,
    };
  }, [monthlyIncome, rentalIncomes, rentalWeighting, existingLoans, summary.monthlyPayment]);

  const toggleYear = (year: number) => {
    setCollapsedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsedYears(new Set(yearSummaries.map((y) => y.year)));
  };
  const expandAll = () => {
    setCollapsedYears(new Set());
  };

  const handleDownloadPDF = () => {
    setIsDownloading(true);
    try {
      generatePDF({
        loanType,
        amount,
        rate,
        duration,
        insuranceRate,
        deferralMonths,
        startDate: startDateStr,
        schedule,
        summary,
        yearSummaries,
        debtRatio,
      });
    } catch (error) {
      console.error("Erreur lors du téléchargement:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  // Group schedule rows by year for rendering
  const rowsByYear = useMemo(() => {
    const map = new Map<number, AmortizationRow[]>();
    schedule.forEach((row) => {
      const year = parseInt(row.date.split("/")[1], 10);
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(row);
    });
    return map;
  }, [schedule]);

  const TypeIcon = config.icon;

  return (
    <div className="min-h-screen bg-background relative">
      {/* Logo full-page background */}
      <div
        className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <img
          src={logoSrc}
          alt=""
          className="w-full h-full object-contain opacity-[0.07] dark:opacity-[0.10] select-none p-8"
          draggable="false"
        />
      </div>
      {/* Install Banner */}
      {showInstallBanner && (
        <div
          className="bg-primary text-primary-foreground px-4 py-2.5 flex items-center justify-between gap-3 text-sm"
          data-testid="install-banner"
        >
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 flex-shrink-0" />
            <span>Installez ADDA CALCULE sur votre téléphone</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleInstall}
              data-testid="button-install"
              className="h-7 text-xs font-semibold"
            >
              Installer
            </Button>
            <button
              onClick={() => setShowInstallBanner(false)}
              className="p-1 rounded hover:bg-white/20 transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10 relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoSrc}
              alt="ADDA CALCULE"
              className="w-10 h-10 rounded-lg object-contain"
            />
            <div>
              <h1
                className="text-base font-bold tracking-tight"
                data-testid="app-title"
              >
                ADDA CALCULE
              </h1>
              <p className="text-xs text-muted-foreground leading-none mt-0.5">
                Simulateur de crédit
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDark}
            data-testid="theme-toggle"
            className="rounded-full"
            aria-label="Changer le thème"
          >
            {isDark ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6 relative z-[1]">
        {/* Input Form */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 border-border/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">
                Paramètres du crédit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Loan Type Selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-muted-foreground" />
                  Type de crédit
                </Label>
                <Select
                  value={loanType}
                  onValueChange={(v) => setLoanType(v as LoanType)}
                >
                  <SelectTrigger data-testid="select-loan-type" className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(LOAN_TYPES) as [LoanType, LoanTypeConfig][]).map(
                      ([key, cfg]) => {
                        const Icon = cfg.icon;
                        return (
                          <SelectItem key={key} value={key}>
                            <span className="flex items-center gap-2">
                              <Icon className="w-3.5 h-3.5" />
                              {cfg.label}
                            </span>
                          </SelectItem>
                        );
                      }
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{config.description}</p>
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <Label
                  htmlFor="startDate"
                  className="text-sm font-medium flex items-center gap-1.5"
                >
                  <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                  Date de début du prêt
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  data-testid="input-start-date"
                  className="font-mono text-sm"
                />
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="amount"
                    className="text-sm font-medium flex items-center gap-1.5"
                  >
                    <Euro className="w-3.5 h-3.5 text-muted-foreground" />
                    Montant emprunté
                  </Label>
                  <span className="text-sm font-mono font-semibold text-primary">
                    {formatCurrency(amount)}
                  </span>
                </div>
                <Slider
                  value={[amount]}
                  onValueChange={([v]) => setAmount(v)}
                  min={config.minAmount}
                  max={config.maxAmount}
                  step={loanType === "renouvelable" ? 100 : 5000}
                  data-testid="slider-amount"
                />
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min={config.minAmount}
                  max={config.maxAmount}
                  step={1000}
                  data-testid="input-amount"
                  className="font-mono text-sm"
                />
              </div>

              {/* Rate */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="rate"
                    className="text-sm font-medium flex items-center gap-1.5"
                  >
                    <Percent className="w-3.5 h-3.5 text-muted-foreground" />
                    Taux d'intérêt annuel
                  </Label>
                  <span className="text-sm font-mono font-semibold text-primary">
                    {formatPercent(rate)}
                  </span>
                </div>
                <Slider
                  value={[rate * 100]}
                  onValueChange={([v]) => setRate(v / 100)}
                  min={10}
                  max={loanType === "renouvelable" ? 2200 : 1000}
                  step={5}
                  data-testid="slider-rate"
                />
                <Input
                  id="rate"
                  type="number"
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  min={0.1}
                  max={loanType === "renouvelable" ? 22 : 10}
                  step={0.05}
                  data-testid="input-rate"
                  className="font-mono text-sm"
                />
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="duration"
                    className="text-sm font-medium flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    Durée (années)
                  </Label>
                  <span className="text-sm font-mono font-semibold text-primary">
                    {duration} ans
                  </span>
                </div>
                <Slider
                  value={[duration]}
                  onValueChange={([v]) => setDuration(v)}
                  min={config.minDuration}
                  max={config.maxDuration}
                  step={1}
                  data-testid="slider-duration"
                />
                <Input
                  id="duration"
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  min={config.minDuration}
                  max={config.maxDuration}
                  step={1}
                  data-testid="input-duration"
                  className="font-mono text-sm"
                />
              </div>

              {/* Insurance (only if type supports it) */}
              {config.hasInsurance && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="insurance"
                      className="text-sm font-medium flex items-center gap-1.5"
                    >
                      <PiggyBank className="w-3.5 h-3.5 text-muted-foreground" />
                      Assurance annuelle
                    </Label>
                    <span className="text-sm font-mono font-semibold text-primary">
                      {formatPercent(insuranceRate)}
                    </span>
                  </div>
                  <Slider
                    value={[insuranceRate * 100]}
                    onValueChange={([v]) => setInsuranceRate(v / 100)}
                    min={0}
                    max={100}
                    step={1}
                    data-testid="slider-insurance"
                  />
                  <Input
                    id="insurance"
                    type="number"
                    value={insuranceRate}
                    onChange={(e) => setInsuranceRate(Number(e.target.value))}
                    min={0}
                    max={1}
                    step={0.01}
                    data-testid="input-insurance"
                    className="font-mono text-sm"
                  />
                </div>
              )}

              {/* Deferral (only for student loans) */}
              {config.hasDeferral && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="deferral"
                      className="text-sm font-medium flex items-center gap-1.5"
                    >
                      <GraduationCap className="w-3.5 h-3.5 text-muted-foreground" />
                      Différé (mois)
                    </Label>
                    <span className="text-sm font-mono font-semibold text-primary">
                      {deferralMonths} mois
                    </span>
                  </div>
                  <Slider
                    value={[deferralMonths]}
                    onValueChange={([v]) => setDeferralMonths(v)}
                    min={0}
                    max={Math.min(60, duration * 12 - 12)}
                    step={1}
                    data-testid="slider-deferral"
                  />
                  <Input
                    id="deferral"
                    type="number"
                    value={deferralMonths}
                    onChange={(e) => setDeferralMonths(Number(e.target.value))}
                    min={0}
                    max={Math.min(60, duration * 12 - 12)}
                    step={1}
                    data-testid="input-deferral"
                    className="font-mono text-sm"
                  />
                  {deferralMonths > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Pendant le différé, seuls les intérêts sont payés.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary KPI Cards */}
          <div className="lg:col-span-2 space-y-6">
            {/* Loan type badge */}
            <div className="flex items-center gap-2">
              <TypeIcon className="w-4 h-4 text-primary" />
              <Badge variant="secondary" className="text-xs font-medium">
                {config.label}
              </Badge>
              {(loanType === "in_fine" || loanType === "relais") && (
                <Badge variant="outline" className="text-xs">
                  Intérêts seuls pendant la durée
                </Badge>
              )}
              {loanType === "etudiant" && deferralMonths > 0 && (
                <Badge variant="outline" className="text-xs">
                  Différé {deferralMonths} mois
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="border-border/60">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Banknote className="w-4 h-4 text-primary" />
                    <p className="text-xs text-muted-foreground font-medium">
                      {loanType === "in_fine" || loanType === "relais"
                        ? "Mensualité (intérêts)"
                        : loanType === "etudiant" && deferralMonths > 0
                        ? "Mensualité (après différé)"
                        : "Mensualité"}
                    </p>
                  </div>
                  <p
                    className="text-lg font-bold font-mono tabular-nums"
                    data-testid="kpi-monthly"
                  >
                    {formatCurrency(summary.monthlyPayment)}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <TrendingDown className="w-4 h-4 text-chart-2" />
                    <p className="text-xs text-muted-foreground font-medium">
                      Coût du crédit
                    </p>
                  </div>
                  <p
                    className="text-lg font-bold font-mono tabular-nums"
                    data-testid="kpi-total-cost"
                  >
                    {formatCurrency(summary.totalCost)}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Percent className="w-4 h-4 text-chart-3" />
                    <p className="text-xs text-muted-foreground font-medium">
                      Total intérêts
                    </p>
                  </div>
                  <p
                    className="text-lg font-bold font-mono tabular-nums"
                    data-testid="kpi-total-interest"
                  >
                    {formatCurrency(summary.totalInterest)}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <PiggyBank className="w-4 h-4 text-chart-4" />
                    <p className="text-xs text-muted-foreground font-medium">
                      Total assurance
                    </p>
                  </div>
                  <p
                    className="text-lg font-bold font-mono tabular-nums"
                    data-testid="kpi-total-insurance"
                  >
                    {formatCurrency(summary.totalInsurance)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Cost Breakdown Bar */}
            <Card className="border-border/60">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">
                    Remboursement total :{" "}
                    <span className="font-mono font-semibold">
                      {formatCurrency(summary.totalPayment)}
                    </span>
                  </p>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />
                      Capital
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-chart-3 inline-block" />
                      Intérêts
                    </span>
                    {config.hasInsurance && (
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-chart-4 inline-block" />
                        Assurance
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full h-4 rounded-full overflow-hidden flex bg-muted">
                  <div
                    className="bg-primary h-full transition-all duration-300"
                    style={{
                      width: `${(amount / summary.totalPayment) * 100}%`,
                    }}
                  />
                  <div
                    className="bg-chart-3 h-full transition-all duration-300"
                    style={{
                      width: `${(summary.totalInterest / summary.totalPayment) * 100}%`,
                    }}
                  />
                  {config.hasInsurance && (
                    <div
                      className="bg-chart-4 h-full transition-all duration-300"
                      style={{
                        width: `${(summary.totalInsurance / summary.totalPayment) * 100}%`,
                      }}
                    />
                  )}
                </div>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground font-mono">
                  <span>
                    {((amount / summary.totalPayment) * 100).toFixed(1)}%
                  </span>
                  <span>
                    {((summary.totalInterest / summary.totalPayment) * 100).toFixed(1)}%
                  </span>
                  {config.hasInsurance && (
                    <span>
                      {((summary.totalInsurance / summary.totalPayment) * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Download Button */}
            <div className="flex justify-end">
              <Button
                onClick={handleDownloadPDF}
                disabled={isDownloading}
                data-testid="button-download-pdf"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                {isDownloading
                  ? "Génération en cours..."
                  : "Télécharger le PDF"}
              </Button>
            </div>
          </div>
        </div>

        {/* ─── Debt Ratio Section ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Income & Existing Loans */}
          <Card className="lg:col-span-1 border-border/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" />
                Revenus & crédits en cours
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Monthly Income */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="income"
                    className="text-sm font-medium flex items-center gap-1.5"
                  >
                    <Euro className="w-3.5 h-3.5 text-muted-foreground" />
                    Revenus nets mensuels du foyer
                  </Label>
                </div>
                <Input
                  id="income"
                  type="number"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                  min={0}
                  step={100}
                  data-testid="input-income"
                  className="font-mono text-sm"
                  placeholder="Ex: 3 500"
                />
              </div>

              {/* Rental Incomes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    Revenus locatifs
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addRentalIncome}
                    data-testid="button-add-rental"
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Ajouter
                  </Button>
                </div>

                {rentalIncomes.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">
                    Aucun revenu locatif. Cliquez "Ajouter" pour déclarer un bien en location.
                  </p>
                )}

                {rentalIncomes.map((rental, index) => (
                  <div
                    key={rental.id}
                    className="flex items-end gap-2 p-3 rounded-lg bg-muted/50 border border-border/40"
                    data-testid={`rental-income-${index}`}
                  >
                    <div className="flex-1 space-y-1.5">
                      <Input
                        type="text"
                        placeholder="Ex: Appt rue de Paris"
                        value={rental.label}
                        onChange={(e) => updateRentalIncome(rental.id, "label", e.target.value)}
                        className="text-sm h-8"
                        data-testid={`input-rental-label-${index}`}
                      />
                      <div className="relative">
                        <Input
                          type="number"
                          placeholder="Loyer brut mensuel"
                          value={rental.grossMonthlyRent || ""}
                          onChange={(e) => updateRentalIncome(rental.id, "grossMonthlyRent", Number(e.target.value))}
                          min={0}
                          step={50}
                          className="font-mono text-sm h-8 pr-8"
                          data-testid={`input-rental-amount-${index}`}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRentalIncome(rental.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                      data-testid={`button-remove-rental-${index}`}
                      aria-label="Supprimer ce revenu locatif"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}

                {/* Weighting slider — always visible */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Percent className="w-3 h-3 text-muted-foreground" />
                      Pondération bancaire
                    </Label>
                    <span className="text-sm font-bold font-mono text-primary" data-testid="rental-weighting-value">
                      {rentalWeighting}%
                    </span>
                  </div>
                  <Slider
                    value={[rentalWeighting]}
                    onValueChange={(v) => setRentalWeighting(v[0])}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                    data-testid="slider-rental-weighting"
                  />
                  <p className="text-xs text-muted-foreground">
                    Les banques retiennent généralement <span className="font-semibold">70%</span> des loyers bruts pour le calcul de la solvabilité (décote de 30% pour charges, vacance locative, impôts).
                  </p>
                </div>
              </div>

              {/* Existing Loans List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                    Crédits en cours
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addExistingLoan}
                    data-testid="button-add-loan"
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Ajouter
                  </Button>
                </div>

                {existingLoans.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">
                    Aucun crédit en cours. Cliquez "Ajouter" pour déclarer un crédit existant.
                  </p>
                )}

                {existingLoans.map((loan, index) => (
                  <div
                    key={loan.id}
                    className="flex items-end gap-2 p-3 rounded-lg bg-muted/50 border border-border/40"
                    data-testid={`existing-loan-${index}`}
                  >
                    <div className="flex-1 space-y-1.5">
                      <Input
                        type="text"
                        placeholder="Ex: Crédit auto"
                        value={loan.label}
                        onChange={(e) => updateExistingLoan(loan.id, "label", e.target.value)}
                        className="text-sm h-8"
                        data-testid={`input-loan-label-${index}`}
                      />
                      <div className="relative">
                        <Input
                          type="number"
                          placeholder="Mensualité"
                          value={loan.monthlyPayment || ""}
                          onChange={(e) => updateExistingLoan(loan.id, "monthlyPayment", Number(e.target.value))}
                          min={0}
                          step={10}
                          className="font-mono text-sm h-8 pr-8"
                          data-testid={`input-loan-amount-${index}`}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeExistingLoan(loan.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                      data-testid={`button-remove-loan-${index}`}
                      aria-label="Supprimer ce crédit"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Debt Ratio Gauge */}
          <Card className={`lg:col-span-2 border-border/60 ${
            debtRatio.verdict === "danger" ? "ring-2 ring-red-500/30" :
            debtRatio.verdict === "warning" ? "ring-2 ring-amber-500/30" : ""
          }`}>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Gauge className="w-4 h-4 text-primary" />
                Taux d'effort
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Gauge bar */}
              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <p className={`text-4xl font-bold font-mono tabular-nums ${
                      debtRatio.verdict === "ok" ? "text-emerald-600 dark:text-emerald-400" :
                      debtRatio.verdict === "warning" ? "text-amber-600 dark:text-amber-400" :
                      "text-red-600 dark:text-red-400"
                    }`} data-testid="debt-ratio-value">
                      {debtRatio.debtRatio.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Seuil bancaire : 35%
                    </p>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                    debtRatio.verdict === "ok"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : debtRatio.verdict === "warning"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                  }`} data-testid="debt-ratio-verdict">
                    {debtRatio.verdict === "ok" ? (
                      <><ShieldCheck className="w-4 h-4" /> Finançable</>
                    ) : debtRatio.verdict === "warning" ? (
                      <><AlertTriangle className="w-4 h-4" /> Limite</>
                    ) : (
                      <><ShieldAlert className="w-4 h-4" /> Taux d'effort trop élevé</>
                    )}
                  </div>
                </div>

                {/* Visual gauge */}
                <div className="relative w-full h-5 rounded-full bg-muted overflow-hidden">
                  {/* Zone markers */}
                  <div className="absolute left-0 top-0 h-full bg-emerald-500/20 dark:bg-emerald-500/15" style={{ width: "30%" }} />
                  <div className="absolute top-0 h-full bg-amber-500/20 dark:bg-amber-500/15" style={{ left: "30%", width: "5%" }} />
                  <div className="absolute top-0 right-0 h-full bg-red-500/15 dark:bg-red-500/10" style={{ left: "35%" }} />

                  {/* Actual bar */}
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${
                      debtRatio.verdict === "ok" ? "bg-emerald-500" :
                      debtRatio.verdict === "warning" ? "bg-amber-500" :
                      "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(debtRatio.debtRatio, 100)}%` }}
                  />

                  {/* 35% marker line */}
                  <div
                    className="absolute top-0 h-full w-0.5 bg-foreground/40"
                    style={{ left: "35%" }}
                  />
                </div>

                {/* Scale labels */}
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                  <span>0%</span>
                  <span style={{ position: "absolute", left: "calc(30% - 8px)" }} className="relative">30%</span>
                  <span style={{ position: "absolute", left: "calc(35% - 8px)" }} className="relative font-semibold">35%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50 border border-border/40">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Revenus nets du foyer</p>
                  <p className="text-sm font-bold font-mono tabular-nums" data-testid="income-display">
                    {formatCurrency(monthlyIncome)}
                  </p>
                </div>
                {debtRatio.totalWeightedRental > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border/40">
                    <p className="text-xs text-muted-foreground font-medium mb-1">
                      Revenus locatifs ({rentalWeighting}%)
                    </p>
                    <p className="text-sm font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
                      +{formatCurrency(debtRatio.totalWeightedRental)}
                    </p>
                  </div>
                )}
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Revenus pris en compte</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-primary" data-testid="effective-income-display">
                    {formatCurrency(debtRatio.totalEffectiveIncome)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border/40">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Nouveau crédit</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-primary">
                    {formatCurrency(debtRatio.newLoanPayment)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border/40">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Total charges mensuelles</p>
                  <p className={`text-sm font-bold font-mono tabular-nums ${
                    debtRatio.verdict === "ok" ? "text-emerald-600 dark:text-emerald-400" :
                    debtRatio.verdict === "warning" ? "text-amber-600 dark:text-amber-400" :
                    "text-red-600 dark:text-red-400"
                  }`}>
                    {formatCurrency(debtRatio.totalMonthlyDebt)}
                  </p>
                </div>
              </div>

              {/* Rental incomes breakdown (if any) */}
              {rentalIncomes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Détail des revenus locatifs</p>
                  <div className="space-y-1.5">
                    {rentalIncomes.map((rental) => (
                      <div key={rental.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate mr-2">
                          {rental.label || "Bien sans nom"}
                        </span>
                        <span className="font-mono font-medium flex-shrink-0">
                          {formatCurrency(rental.grossMonthlyRent)} brut → <span className="text-blue-600 dark:text-blue-400">{formatCurrency(rental.grossMonthlyRent * rentalWeighting / 100)}</span> retenu
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Existing loans breakdown (if any) */}
              {existingLoans.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Détail des charges</p>
                  <div className="space-y-1.5">
                    {existingLoans.map((loan) => (
                      <div key={loan.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate mr-2">
                          {loan.label || "Crédit sans nom"}
                        </span>
                        <span className="font-mono font-medium flex-shrink-0">
                          {formatCurrency(loan.monthlyPayment)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                      <span className="text-primary font-medium">{config.label} (nouveau)</span>
                      <span className="font-mono font-bold text-primary">
                        {formatCurrency(debtRatio.newLoanPayment)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Advice */}
              <div className={`text-xs p-3 rounded-lg ${
                debtRatio.verdict === "ok"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                  : debtRatio.verdict === "warning"
                  ? "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                  : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"
              }`}>
                {debtRatio.verdict === "ok" ? (
                  <p>Votre taux d'effort est inférieur à 30%. Les banques considèrent généralement que votre capacité d'emprunt est bonne.</p>
                ) : debtRatio.verdict === "warning" ? (
                  <p>Votre taux d'effort est entre 30% et 35%. Certaines banques peuvent accepter ce dossier, mais il est proche de la limite réglementaire du HCSF.</p>
                ) : (
                  <p>Votre taux d'effort dépasse 35%. Selon les recommandations du HCSF (Haut Conseil de Stabilité Financière), les banques ne doivent pas accorder de prêt au-delà de ce seuil, sauf exceptions limitées.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Amortization Table with Year Summaries */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">
                Tableau d'amortissement
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={expandAll}
                  className="text-xs h-7"
                  data-testid="button-expand-all"
                >
                  Tout déplier
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={collapseAll}
                  className="text-xs h-7"
                  data-testid="button-collapse-all"
                >
                  Tout replier
                </Button>
                <Badge variant="secondary" className="font-mono text-xs">
                  {schedule.length} mois
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-[1]">
                  <TableRow className="border-border/60">
                    <TableHead className="text-xs font-semibold w-12 text-center">
                      Mois
                    </TableHead>
                    <TableHead className="text-xs font-semibold w-20 text-center">
                      Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-right">
                      Mensualité
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-right">
                      Capital
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-right">
                      Intérêts
                    </TableHead>
                    {config.hasInsurance && (
                      <TableHead className="text-xs font-semibold text-right">
                        Assurance
                      </TableHead>
                    )}
                    <TableHead className="text-xs font-semibold text-right">
                      Capital restant
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearSummaries.map((ys) => {
                    const isCollapsed = collapsedYears.has(ys.year);
                    const yearRows = rowsByYear.get(ys.year) || [];

                    return (
                      <>{/* Fragment key set on year summary row */}
                        {/* Year header row */}
                        <TableRow
                          key={`year-${ys.year}`}
                          className="bg-primary/8 hover:bg-primary/12 cursor-pointer border-border/60 transition-colors"
                          onClick={() => toggleYear(ys.year)}
                          data-testid={`year-header-${ys.year}`}
                        >
                          <TableCell colSpan={2} className="text-xs font-bold py-2">
                            <span className="flex items-center gap-1.5">
                              {isCollapsed ? (
                                <ChevronRight className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                              Année {ys.year}
                              <span className="text-muted-foreground font-normal ml-1">
                                ({ys.monthCount} mois)
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold py-2">
                            {formatCurrency(ys.totalPayment)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold text-primary py-2">
                            {formatCurrency(ys.totalPrincipal)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold py-2">
                            {formatCurrency(ys.totalInterest)}
                          </TableCell>
                          {config.hasInsurance && (
                            <TableCell className="text-right font-mono text-xs font-bold py-2">
                              {formatCurrency(ys.totalInsurance)}
                            </TableCell>
                          )}
                          <TableCell className="text-right font-mono text-xs font-bold py-2">
                            {formatCurrency(ys.remainingBalance)}
                          </TableCell>
                        </TableRow>

                        {/* Monthly rows (hidden when collapsed) */}
                        {!isCollapsed &&
                          yearRows.map((row) => (
                            <TableRow
                              key={row.month}
                              className="border-border/40 hover:bg-muted/40 transition-colors"
                              data-testid={`row-month-${row.month}`}
                            >
                              <TableCell className="text-center font-mono text-xs font-medium text-muted-foreground">
                                {row.month}
                              </TableCell>
                              <TableCell className="text-center font-mono text-xs text-muted-foreground">
                                {row.date}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {formatCurrency(row.payment)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs text-primary font-medium">
                                {formatCurrency(row.principal)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {formatCurrency(row.interest)}
                              </TableCell>
                              {config.hasInsurance && (
                                <TableCell className="text-right font-mono text-xs">
                                  {formatCurrency(row.insurance)}
                                </TableCell>
                              )}
                              <TableCell className="text-right font-mono text-xs font-medium">
                                {formatCurrency(row.remainingBalance)}
                              </TableCell>
                            </TableRow>
                          ))}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground pb-6 pt-2">
          ADDA CALCULE — Simulateur de crédit. Les résultats sont fournis à
          titre indicatif.
        </footer>
      </main>
    </div>
  );
}
