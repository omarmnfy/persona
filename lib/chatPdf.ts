import jsPDF from "jspdf";

type PdfMessage = {
  id: string;
  createdAt: string;
  type: "USER" | "SYSTEM";
  body: string;
  isQuestion?: boolean;
  sender: { id: string; displayName: string } | null;
  recipient: { id: string; displayName: string } | null;
};

type PdfOptions = {
  roomNumber: number | string;
  topic: string;
  yourRole: string;
  yourDisplayName: string;
  messages: PdfMessage[];
};

const COLORS = {
  question: [220, 38, 38] as [number, number, number],
  system: [100, 116, 139] as [number, number, number],
  answer: [15, 23, 42] as [number, number, number],
  headerBg: [241, 245, 249] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  accent: [79, 70, 229] as [number, number, number],
  border: [203, 213, 225] as [number, number, number],
};

function buildChatPdf(options: PdfOptions): jsPDF {
  const { roomNumber, topic, yourRole, yourDisplayName, messages } = options;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  function checkPageBreak(needed: number) {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  doc.setFillColor(...COLORS.headerBg);
  doc.roundedRect(margin, y, contentWidth, 32, 3, 3, "F");

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.accent);
  doc.text("Persona \u2014 Chat Transcript", margin + 5, y);

  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.text(`Room ${roomNumber}  \u2022  Topic: ${topic}`, margin + 5, y);

  y += 6;
  doc.text(`Your Role: ${yourRole}  \u2022  Display Name: ${yourDisplayName}`, margin + 5, y);

  y += 5;
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin + 5, y);

  y += 10;

  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  for (const msg of messages) {
    const time = new Date(msg.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const isSystem = msg.type === "SYSTEM";
    const isQuestion = Boolean(msg.isQuestion);
    const senderName = isSystem ? "System" : msg.sender?.displayName ?? "Unknown";
    const dmNote = msg.recipient ? ` \u2192 ${msg.recipient.displayName}` : "";

    const headerLine = `[${time}] ${senderName}${isQuestion ? " (Question)" : ""}${dmNote}`;

    doc.setFontSize(8);
    if (isQuestion) {
      doc.setTextColor(...COLORS.question);
      doc.setFont("helvetica", "bold");
    } else if (isSystem) {
      doc.setTextColor(...COLORS.system);
      doc.setFont("helvetica", "italic");
    } else {
      doc.setTextColor(...COLORS.muted);
      doc.setFont("helvetica", "normal");
    }

    checkPageBreak(12);
    doc.text(headerLine, margin, y);
    y += 4;

    doc.setFontSize(10);
    if (isQuestion) {
      doc.setTextColor(...COLORS.question);
      doc.setFont("helvetica", "bold");
    } else if (isSystem) {
      doc.setTextColor(...COLORS.system);
      doc.setFont("helvetica", "italic");
    } else {
      doc.setTextColor(...COLORS.answer);
      doc.setFont("helvetica", "normal");
    }

    const lines = doc.splitTextToSize(msg.body, contentWidth - 2);
    for (const line of lines) {
      checkPageBreak(5);
      doc.text(line, margin + 2, y);
      y += 5;
    }

    y += 3;
  }

  y += 4;
  checkPageBreak(10);
  doc.setDrawColor(...COLORS.border);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Persona \u2022 COGS123: Mind, Brains, & Programs \u2022 The Claremont Colleges \u2022 Created by Omar Mnfy",
    pageWidth / 2,
    y,
    { align: "center" }
  );

  return doc;
}

export function generateChatPdf(options: PdfOptions) {
  const doc = buildChatPdf(options);
  const fileName = `Room${options.roomNumber}_Transcript_${options.yourRole.replace(/\s/g, "")}.pdf`;
  doc.save(fileName);
}

export function generateChatPdfBuffer(options: PdfOptions): Buffer {
  const doc = buildChatPdf(options);
  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
