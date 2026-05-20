import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import * as PDFDocument from 'pdfkit';

interface AuditLog {
  column_name: string;
  issue_detected: string;
  strategy_chosen: string;
  reason: string;
  confidence_score: number;
  accuracy_delta: number;
}

interface Dataset {
  id: string;
  filename: string;
  status: string;
  row_count: number;
  column_count: number;
  created_at: string;
  leakage_report: Record<string, unknown> | null;
}

@Injectable()
export class ComplianceService {
  private supabase;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  async generateComplianceReport(datasetId: string): Promise<Buffer> {
    const { data: dataset } = await this.supabase
      .from('datasets')
      .select('*')
      .eq('id', datasetId)
      .single();

    const { data: auditLogs } = await this.supabase
      .from('audit_logs')
      .select('*')
      .eq('dataset_id', datasetId)
      .order('created_at', { ascending: true });

    const pdfBuffer = await this.buildPDF(dataset as Dataset, auditLogs as AuditLog[]);

    // Store PDF to Supabase Storage
    const filePath = `compliance/${datasetId}.pdf`;
    await this.supabase.storage.from('reports').upload(filePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

    return pdfBuffer;
  }

  private async buildPDF(dataset: Dataset, auditLogs: AuditLog[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc.fontSize(24).text('Data Preprocessing Compliance Report', { align: 'center' });
      doc.moveDown();

      // Dataset Info
      doc.fontSize(14).text('Dataset Information', { underline: true });
      doc.fontSize(12);
      doc.text(`Filename: ${dataset.filename}`);
      doc.text(`Rows: ${dataset.row_count || 'N/A'}`);
      doc.text(`Columns: ${dataset.column_count || 'N/A'}`);
      doc.text(`Status: ${dataset.status}`);
      doc.text(`Created: ${new Date(dataset.created_at).toLocaleDateString()}`);
      doc.moveDown();

      // Leakage Report
      doc.fontSize(14).text('Data Leakage Assessment', { underline: true });
      doc.fontSize(12);

      const leakage = dataset.leakage_report as Record<string, unknown> | null;
      if (leakage) {
        const hasLeakage = leakage.has_leakage as boolean;
        const riskScore = leakage.leakage_risk_score as number;
        const leakingCols = leakage.leaking_columns as string[];

        if (hasLeakage) {
          doc.fontSize(12).fillColor('red').text('Leakage Detected');
          doc.fillColor('black');
          doc.text(`Risk Score: ${(riskScore * 100).toFixed(0)}%`);
          doc.text(`Leaking Columns: ${leakingCols.join(', ') || 'None'}`);
        } else {
          doc.fontSize(12).fillColor('green').text('✓ Zero Leakage Verified');
          doc.fillColor('black');
          doc.text(`Risk Score: ${(riskScore * 100).toFixed(0)}%`);
        }
      } else {
        doc.text('No leakage assessment available.');
      }
      doc.moveDown();

      // Audit Trail
      doc.fontSize(14).text('Audit Trail', { underline: true });
      doc.fontSize(12);

      for (const log of auditLogs) {
        doc.text(`\nColumn: ${log.column_name}`);
        doc.text(`  Action: ${log.issue_detected} → ${log.strategy_chosen}`);
        if (log.reason) {
          doc.text(`  Reason: ${log.reason.substring(0, 100)}...`);
        }
        doc.text(`  Confidence: ${(log.confidence_score * 100).toFixed(0)}%`);
        doc.text(`  Accuracy Delta: ${log.accuracy_delta.toFixed(4)}`);
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(10).text(
        `Generated on ${new Date().toISOString()} by AI Preprocessing Engine`,
        { align: 'center' }
      );

      doc.end();
    });
  }
}