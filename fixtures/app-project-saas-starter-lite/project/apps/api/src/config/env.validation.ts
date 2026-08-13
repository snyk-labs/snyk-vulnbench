import { plainToInstance } from 'class-transformer';
import { IsString, IsNotEmpty, IsNumber, IsOptional, validateSync, Min, Max } from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty({ message: 'JWT_SECRET is required. Generate one with: openssl rand -base64 32' })
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty({ message: 'JWT_REFRESH_SECRET is required. Generate one with: openssl rand -base64 32' })
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsNotEmpty({ message: 'DB_HOST is required (e.g. localhost)' })
  DB_HOST: string;

  @IsString()
  @IsNotEmpty({ message: 'DB_USERNAME is required (e.g. postgres)' })
  DB_USERNAME: string;

  @IsString()
  @IsNotEmpty({ message: 'DB_PASSWORD is required' })
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty({ message: 'DB_NAME is required (e.g. saas_lite_db)' })
  DB_NAME: string;

  @IsOptional() @IsNumber() @Min(1) @Max(65535) PORT?: number;
  @IsOptional() @IsString() NODE_ENV?: string;
  @IsOptional() @IsString() FRONTEND_URL?: string;
  @IsOptional() @IsNumber() DB_PORT?: number;
  @IsOptional() @IsString() RESEND_API_KEY?: string;
  @IsOptional() @IsString() GOOGLE_CLIENT_ID?: string;
  @IsOptional() @IsString() GOOGLE_CLIENT_SECRET?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((err) => {
        const constraints = Object.values(err.constraints || {});
        return `  - ${err.property}: ${constraints.join(', ')}`;
      })
      .join('\n');

    throw new Error(
      `\n\nEnvironment validation failed:\n${messages}\n\nCopy .env.example to .env and fill in the required values:\n  cp .env.example .env\n`,
    );
  }

  return validatedConfig;
}
