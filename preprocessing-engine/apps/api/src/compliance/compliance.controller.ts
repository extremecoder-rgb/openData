import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { ComplianceService } from './compliance.service';

@Controller('datasets')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get(':id/compliance-report')
  async getComplianceReport(
    @Param('id') id: string,
    @Res() res: any,
  ) {
    try {
      const pdfBuffer = await this.complianceService.generateComplianceReport(id);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="compliance-report-${id}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      res.end(pdfBuffer);
    } catch (error) {
      throw new NotFoundException('Failed to generate compliance report');
    }
  }
}