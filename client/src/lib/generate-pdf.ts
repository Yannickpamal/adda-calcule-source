import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { LoanType, AmortizationRow, YearSummary, LoanSummary, DebtRatioData } from "@/pages/home";
import { LOAN_TYPES } from "@/pages/home";

interface PdfParams {
  loanType: LoanType;
  amount: number;
  rate: number;
  duration: number;
  insuranceRate: number;
  deferralMonths: number;
  startDate: string;
  schedule: AmortizationRow[];
  summary: LoanSummary;
  yearSummaries: YearSummary[];
  debtRatio: DebtRatioData;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function generatePDF(params: PdfParams): void {
  const {
    loanType,
    amount,
    rate,
    debtRatio,
    duration,
    insuranceRate,
    deferralMonths,
    startDate,
    schedule,
    summary,
    yearSummaries,
  } = params;

  const config = LOAN_TYPES[loanType];
  const hasInsurance = config.hasInsurance;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  // Colors
  const primaryBlue: [number, number, number] = [26, 95, 180];
  const darkText: [number, number, number] = [26, 28, 46];
  const mutedText: [number, number, number] = [92, 95, 114];
  const headerBg: [number, number, number] = [26, 95, 180];
  const headerText: [number, number, number] = [255, 255, 255];
  const lightBg: [number, number, number] = [240, 242, 248];
  const yearRowBg: [number, number, number] = [220, 230, 245];

  let y = 20;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...primaryBlue);
  doc.text("ADDA CALCULE", margin, y);

  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...mutedText);
  doc.text("Simulateur de crédit", margin, y);

  // Separator
  y += 6;
  doc.setDrawColor(216, 219, 230);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  // Loan Parameters
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...darkText);
  doc.text("Paramètres du crédit", margin, y);

  y += 8;

  // Format start date for display
  const dateParts = startDate.split("-");
  const dateDisplay =
    dateParts.length >= 2
      ? `${dateParts[2] || "01"}/${dateParts[1]}/${dateParts[0]}`
      : startDate;

  const paramData: [string, string][] = [
    ["Type de crédit", config.label],
    ["Date de début", dateDisplay],
    ["Montant emprunté", `${fmt(amount)} €`],
    ["Taux d'intérêt annuel", `${fmt(rate)} %`],
    ["Durée", `${duration} ans (${duration * 12} mois)`],
  ];
  if (hasInsurance) {
    paramData.push(["Taux d'assurance annuel", `${fmt(insuranceRate)} %`]);
  }
  if (config.hasDeferral && deferralMonths > 0) {
    paramData.push(["Différé de remboursement", `${deferralMonths} mois`]);
  }

  paramData.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...mutedText);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkText);
    doc.text(value, 110, y);
    y += 6;
  });

  // Separator
  y += 3;
  doc.setDrawColor(216, 219, 230);
  doc.line(margin, y, pageWidth - margin, y);

  // Summary
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...darkText);
  doc.text("Résumé", margin, y);

  y += 8;
  const mensualiteLabel =
    loanType === "in_fine" || loanType === "relais"
      ? "Mensualité (intérêts seuls)"
      : loanType === "etudiant" && deferralMonths > 0
      ? "Mensualité (après différé)"
      : "Mensualité (assurance incluse)";

  const summaryData: [string, string][] = [
    [mensualiteLabel, `${fmt(summary.monthlyPayment)} €`],
    ["Remboursement total", `${fmt(summary.totalPayment)} €`],
    ["Total des intérêts", `${fmt(summary.totalInterest)} €`],
  ];
  if (hasInsurance) {
    summaryData.push(["Total de l'assurance", `${fmt(summary.totalInsurance)} €`]);
  }
  summaryData.push([
    "Coût du crédit (intérêts" + (hasInsurance ? " + assurance)" : ")"),
    `${fmt(summary.totalCost)} €`,
  ]);

  summaryData.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...mutedText);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryBlue);
    doc.text(value, 110, y);
    y += 6;
  });

  // Separator
  y += 5;
  doc.setDrawColor(216, 219, 230);
  doc.line(margin, y, pageWidth - margin, y);

  // Debt Ratio Section
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...darkText);
  doc.text("Taux d'effort", margin, y);

  y += 8;
  const ratioColor: [number, number, number] = debtRatio.verdict === "ok"
    ? [16, 163, 127] // emerald
    : debtRatio.verdict === "warning"
    ? [217, 119, 6] // amber
    : [220, 38, 38]; // red

  // Gauge bar background
  doc.setFillColor(240, 242, 248);
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 6, 3, 3, "F");

  // Gauge bar fill
  const gaugeWidth = Math.min(debtRatio.debtRatio, 100) / 100 * (pageWidth - 2 * margin);
  doc.setFillColor(...ratioColor);
  doc.roundedRect(margin, y, gaugeWidth, 6, 3, 3, "F");

  // 35% marker
  const marker35 = margin + 0.35 * (pageWidth - 2 * margin);
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.4);
  doc.line(marker35, y - 1, marker35, y + 7);

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...ratioColor);
  doc.text(`${debtRatio.debtRatio.toFixed(1)}%`, margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...mutedText);
  doc.text(
    debtRatio.verdict === "ok" ? "Finançable — Taux d'effort acceptable"
    : debtRatio.verdict === "warning" ? "Limite — Proche du seuil de 35%"
    : "Refus probable — Taux d'effort supérieur à 35%",
    margin + 25, y
  );

  doc.text("Seuil HCSF : 35%", pageWidth - margin, y, { align: "right" });

  y += 8;

  // Income section
  const incomeBlue: [number, number, number] = [37, 99, 235];
  const incomeData: [string, string, [number, number, number]][] = [
    ["Revenus nets mensuels du foyer", `${fmt(debtRatio.monthlyIncome)} \u20ac`, darkText],
  ];
  if (debtRatio.rentalIncomes.length > 0) {
    debtRatio.rentalIncomes.forEach((rental) => {
      const weighted = rental.grossMonthlyRent * debtRatio.rentalWeighting / 100;
      incomeData.push([
        `${rental.label || "Bien locatif"} (${fmt(rental.grossMonthlyRent)} \u20ac brut \u00d7 ${debtRatio.rentalWeighting}%)`,
        `+${fmt(weighted)} \u20ac`,
        incomeBlue,
      ]);
    });
  }
  incomeData.push([
    "Revenus pris en compte par la banque",
    `${fmt(debtRatio.totalEffectiveIncome)} \u20ac`,
    primaryBlue,
  ]);

  incomeData.forEach(([label, value, color]) => {
    const isTotal = label === "Revenus pris en compte par la banque";
    doc.setFont("helvetica", isTotal ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(...mutedText);
    doc.text(label!, margin, y);
    doc.setFont("helvetica", isTotal ? "bold" : "normal");
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(value!, 130, y);
    y += 6;
  });

  y += 2;

  // Charges section
  const chargesData: [string, string][] = [];
  if (debtRatio.existingLoans.length > 0) {
    debtRatio.existingLoans.forEach((loan) => {
      chargesData.push([
        loan.label || "Cr\u00e9dit en cours",
        `${fmt(loan.monthlyPayment)} \u20ac`,
      ]);
    });
  }
  chargesData.push([`${config.label} (nouveau)`, `${fmt(debtRatio.newLoanPayment)} \u20ac`]);
  chargesData.push(["Total charges mensuelles", `${fmt(debtRatio.totalMonthlyDebt)} \u20ac`]);

  chargesData.forEach(([label, value], i) => {
    const isLast = i === chargesData.length - 1;
    doc.setFont("helvetica", isLast ? "bold" : "normal");
    doc.setFontSize(9);
    const labelColor = isLast ? ratioColor : mutedText;
    doc.setTextColor(labelColor[0], labelColor[1], labelColor[2]);
    doc.text(label!, margin, y);
    const valueColor = isLast ? ratioColor : darkText;
    doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
    doc.text(value!, 130, y);
    y += 6;
  });

  // Separator
  y += 3;
  doc.setDrawColor(216, 219, 230);
  doc.line(margin, y, pageWidth - margin, y);

  // Amortization Table with year subtotals
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...darkText);
  doc.text("Tableau d'amortissement", margin, y);

  y += 4;

  // Build table data with year summary rows interleaved
  const headColumns = hasInsurance
    ? ["Mois", "Date", "Mensualité", "Capital", "Intérêts", "Assurance", "Capital restant"]
    : ["Mois", "Date", "Mensualité", "Capital", "Intérêts", "Capital restant"];

  // Group rows by year
  const rowsByYear = new Map<number, AmortizationRow[]>();
  schedule.forEach((row) => {
    const year = parseInt(row.date.split("/")[1], 10);
    if (!rowsByYear.has(year)) rowsByYear.set(year, []);
    rowsByYear.get(year)!.push(row);
  });

  const tableBody: { content: string[]; isYearRow: boolean }[] = [];

  yearSummaries.forEach((ys) => {
    const yearRows = rowsByYear.get(ys.year) || [];

    // Year header / summary row
    const yearSummaryRow = hasInsurance
      ? [
          `Année ${ys.year}`,
          `${ys.monthCount} mois`,
          `${fmt(ys.totalPayment)} €`,
          `${fmt(ys.totalPrincipal)} €`,
          `${fmt(ys.totalInterest)} €`,
          `${fmt(ys.totalInsurance)} €`,
          `${fmt(ys.remainingBalance)} €`,
        ]
      : [
          `Année ${ys.year}`,
          `${ys.monthCount} mois`,
          `${fmt(ys.totalPayment)} €`,
          `${fmt(ys.totalPrincipal)} €`,
          `${fmt(ys.totalInterest)} €`,
          `${fmt(ys.remainingBalance)} €`,
        ];
    tableBody.push({ content: yearSummaryRow, isYearRow: true });

    // Individual month rows
    yearRows.forEach((row) => {
      const monthRow = hasInsurance
        ? [
            row.month.toString(),
            row.date,
            `${fmt(row.payment)} €`,
            `${fmt(row.principal)} €`,
            `${fmt(row.interest)} €`,
            `${fmt(row.insurance)} €`,
            `${fmt(row.remainingBalance)} €`,
          ]
        : [
            row.month.toString(),
            row.date,
            `${fmt(row.payment)} €`,
            `${fmt(row.principal)} €`,
            `${fmt(row.interest)} €`,
            `${fmt(row.remainingBalance)} €`,
          ];
      tableBody.push({ content: monthRow, isYearRow: false });
    });
  });

  const colCount = hasInsurance ? 7 : 6;
  const colStyles: Record<number, any> = {
    0: { halign: "center", cellWidth: 18 },
    1: { halign: "center", cellWidth: 18 },
  };
  for (let i = 2; i < colCount; i++) {
    colStyles[i] = { halign: "right" };
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [headColumns],
    body: tableBody.map((r) => r.content),
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      font: "helvetica",
      textColor: darkText,
    },
    headStyles: {
      fillColor: headerBg,
      textColor: headerText,
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "right",
    },
    columnStyles: colStyles,
    alternateRowStyles: {
      fillColor: lightBg,
    },
    didParseCell: (data: any) => {
      // Style year summary rows
      if (data.section === "body") {
        const rowIndex = data.row.index;
        const rowData = tableBody[rowIndex];
        if (rowData && rowData.isYearRow) {
          data.cell.styles.fillColor = yearRowBg;
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fontSize = 7.5;
          data.cell.styles.textColor = primaryBlue;
        }
      }
    },
    didDrawPage: (data: any) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...mutedText);
      doc.text(
        "Document généré par ADDA CALCULE. Les résultats sont fournis à titre indicatif.",
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: "center" }
      );
      doc.text(
        `Page ${data.pageNumber}`,
        pageWidth - margin,
        doc.internal.pageSize.getHeight() - 8,
        { align: "right" }
      );
    },
  });

  // Save
  const typeLabel = config.label.replace(/\s+/g, "_");
  doc.save(
    `ADDA_CALCULE_${typeLabel}_${fmt(amount)}€_${duration}ans.pdf`
  );
}
