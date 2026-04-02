import type { Express } from "express";
import { createServer, type Server } from "http";
import PDFDocument from "pdfkit";

interface LoanParams {
  amount: number;
  rate: number;
  duration: number;
  insuranceRate: number;
}

function computeAmortization(params: LoanParams) {
  const { amount, rate, duration, insuranceRate } = params;
  const months = duration * 12;
  const monthlyRate = rate / 100 / 12;
  const monthlyInsurance = (amount * (insuranceRate / 100)) / 12;

  let monthlyPayment: number;
  if (monthlyRate === 0) {
    monthlyPayment = amount / months;
  } else {
    monthlyPayment =
      (amount * monthlyRate * Math.pow(1 + monthlyRate, months)) /
      (Math.pow(1 + monthlyRate, months) - 1);
  }

  const rows: {
    month: number;
    payment: number;
    principal: number;
    interest: number;
    insurance: number;
    remainingBalance: number;
  }[] = [];

  let balance = amount;
  let totalInterest = 0;
  let totalInsurance = 0;

  for (let i = 1; i <= months; i++) {
    const interestPart = balance * monthlyRate;
    const principalPart = monthlyPayment - interestPart;
    balance = Math.max(0, balance - principalPart);
    totalInterest += interestPart;
    totalInsurance += monthlyInsurance;

    rows.push({
      month: i,
      payment: monthlyPayment + monthlyInsurance,
      principal: principalPart,
      interest: interestPart,
      insurance: monthlyInsurance,
      remainingBalance: balance,
    });
  }

  return {
    rows,
    summary: {
      monthlyPayment: monthlyPayment + monthlyInsurance,
      totalPayment: monthlyPayment * months + totalInsurance,
      totalInterest,
      totalInsurance,
      totalCost: totalInterest + totalInsurance,
    },
  };
}

function fmt(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/generate-pdf", (req, res) => {
    try {
      const { amount, rate, duration, insuranceRate } = req.body as LoanParams;

      if (!amount || !rate || !duration || insuranceRate === undefined) {
        res.status(400).json({ error: "Paramètres manquants" });
        return;
      }

      const { rows, summary } = computeAmortization({
        amount,
        rate,
        duration,
        insuranceRate,
      });

      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        info: {
          Title: "ADDA CALCULE - Tableau d'amortissement",
          Author: "ADDA CALCULE",
        },
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="ADDA_CALCULE_amortissement.pdf"`
      );

      doc.pipe(res);

      // Colors
      const primaryBlue = "#1a5fb4";
      const darkText = "#1a1c2e";
      const mutedText = "#5c5f72";
      const lightBg = "#f0f2f8";
      const headerBg = "#1a5fb4";
      const headerText = "#ffffff";
      const borderColor = "#d8dbe6";
      const accentGreen = "#2d8a56";

      // Title
      doc
        .font("Helvetica-Bold")
        .fontSize(22)
        .fillColor(primaryBlue)
        .text("ADDA CALCULE", 40, 40);

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(mutedText)
        .text("Simulateur de crédit immobilier", 40, 65);

      // Line separator
      doc
        .moveTo(40, 85)
        .lineTo(555, 85)
        .strokeColor(borderColor)
        .lineWidth(1)
        .stroke();

      // Loan parameters section
      let y = 100;
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(darkText)
        .text("Paramètres du crédit", 40, y);

      y += 22;
      const paramCol1 = 40;
      const paramCol2 = 300;

      const params = [
        ["Montant emprunté", `${fmt(amount)} €`],
        ["Taux d'intérêt annuel", `${fmt(rate)} %`],
        ["Durée", `${duration} ans (${duration * 12} mois)`],
        ["Taux d'assurance annuel", `${fmt(insuranceRate)} %`],
      ];

      params.forEach(([label, value]) => {
        doc.font("Helvetica").fontSize(9).fillColor(mutedText).text(label!, paramCol1, y);
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(darkText)
          .text(value!, paramCol2, y);
        y += 16;
      });

      y += 8;
      doc
        .moveTo(40, y)
        .lineTo(555, y)
        .strokeColor(borderColor)
        .lineWidth(0.5)
        .stroke();

      // Summary section
      y += 12;
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(darkText)
        .text("Résumé", 40, y);

      y += 22;

      const summaryItems = [
        ["Mensualité (assurance incluse)", `${fmt(summary.monthlyPayment)} €`],
        ["Coût total du crédit", `${fmt(summary.totalPayment)} €`],
        ["Total des intérêts", `${fmt(summary.totalInterest)} €`],
        ["Total de l'assurance", `${fmt(summary.totalInsurance)} €`],
        [
          "Coût total (intérêts + assurance)",
          `${fmt(summary.totalCost)} €`,
        ],
      ];

      summaryItems.forEach(([label, value]) => {
        doc.font("Helvetica").fontSize(9).fillColor(mutedText).text(label!, paramCol1, y);
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(primaryBlue)
          .text(value!, paramCol2, y);
        y += 16;
      });

      y += 12;
      doc
        .moveTo(40, y)
        .lineTo(555, y)
        .strokeColor(borderColor)
        .lineWidth(0.5)
        .stroke();

      // Amortization table
      y += 12;
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(darkText)
        .text("Tableau d'amortissement", 40, y);

      y += 20;

      const colWidths = [42, 85, 85, 85, 85, 105];
      const colX = [40];
      for (let i = 1; i < colWidths.length; i++) {
        colX.push(colX[i - 1]! + colWidths[i - 1]!);
      }
      const headers = [
        "Mois",
        "Mensualité",
        "Capital",
        "Intérêts",
        "Assurance",
        "Capital restant",
      ];
      const rowHeight = 16;

      function drawTableHeader(yPos: number): number {
        // Header background
        doc
          .rect(40, yPos, 515, rowHeight + 4)
          .fill(headerBg);

        headers.forEach((h, i) => {
          doc
            .font("Helvetica-Bold")
            .fontSize(7.5)
            .fillColor(headerText)
            .text(h, colX[i]! + 4, yPos + 4, {
              width: colWidths[i]! - 8,
              align: i === 0 ? "center" : "right",
            });
        });
        return yPos + rowHeight + 4;
      }

      y = drawTableHeader(y);

      rows.forEach((row, idx) => {
        // Check for page break
        if (y > 760) {
          doc.addPage();
          y = 40;

          // Re-draw title on new page
          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor(mutedText)
            .text("ADDA CALCULE — Tableau d'amortissement (suite)", 40, y);
          y += 18;
          y = drawTableHeader(y);
        }

        // Alternate row bg
        if (idx % 2 === 0) {
          doc.rect(40, y, 515, rowHeight).fill(lightBg);
        }

        const values = [
          row.month.toString(),
          `${fmt(row.payment)} €`,
          `${fmt(row.principal)} €`,
          `${fmt(row.interest)} €`,
          `${fmt(row.insurance)} €`,
          `${fmt(row.remainingBalance)} €`,
        ];

        values.forEach((v, i) => {
          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(darkText)
            .text(v, colX[i]! + 4, y + 4, {
              width: colWidths[i]! - 8,
              align: i === 0 ? "center" : "right",
            });
        });

        y += rowHeight;
      });

      // Footer
      y += 16;
      if (y > 780) {
        doc.addPage();
        y = 40;
      }

      doc
        .moveTo(40, y)
        .lineTo(555, y)
        .strokeColor(borderColor)
        .lineWidth(0.5)
        .stroke();

      y += 8;
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(mutedText)
        .text(
          "Document généré par ADDA CALCULE. Les résultats sont fournis à titre indicatif et ne constituent pas une offre de prêt.",
          40,
          y,
          { width: 515, align: "center" }
        );

      doc.end();
    } catch (error) {
      console.error("PDF generation error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erreur lors de la génération du PDF" });
      }
    }
  });

  return httpServer;
}
