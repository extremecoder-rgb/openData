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