import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generateSIIReportPDF = (title: string, columns: string[], data: any[][]) => {
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text(title, 14, 20);
  
  autoTable(doc, {
    head: [columns],
    body: data,
    startY: 30,
    theme: 'plain',
    styles: { fontSize: 10, font: 'helvetica' },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0] },
  });
  
  doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
};
