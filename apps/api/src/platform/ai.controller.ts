import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { ChangeProposal } from '@nova/sdk';
import { requireActor } from '../common/actor.middleware';
import type { NovaRequest } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { generateAiProposalSchema } from './dto';
import type { GenerateAiProposalDto } from './dto';
import { PlatformService } from './platform.service';

@Controller('v1/apps/:appId/ai/proposals')
export class AiProposalController {
  constructor(@Inject(PlatformService) private readonly service: PlatformService) {}

  @Post()
  generate(
    @Req() request: NovaRequest,
    @Param('appId') appId: string,
    @Body(new ZodValidationPipe(generateAiProposalSchema)) body: GenerateAiProposalDto
  ): Promise<ChangeProposal> {
    return this.service.generateAiProposal(requireActor(request), appId, body);
  }
}
