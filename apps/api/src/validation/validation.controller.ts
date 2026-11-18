import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { validateAppDefinition } from '@nova/spec-validator';
import type { ValidationResult } from '@nova/spec-validator';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

interface ValidateDefinitionRequest {
  definition: unknown;
}

const validateDefinitionRequestSchema = z.object({
  definition: z.unknown().refine((value) => value !== undefined, {
    message: 'Definition is required'
  })
});

@Controller('v1/spec')
export class ValidationController {
  @Post('validate')
  @UsePipes(new ZodValidationPipe(validateDefinitionRequestSchema))
  validate(@Body() body: ValidateDefinitionRequest): ValidationResult {
    return validateAppDefinition(body.definition);
  }
}
