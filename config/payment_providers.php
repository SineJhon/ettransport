<?php

declare(strict_types=1);

/**
 * ET Transport — payment provider abstraction.
 *
 * What this file is:
 *   A clean boundary between the application and any external payment
 *   gateway. It owns the environment configuration for the payment
 *   processing mode and decides, authoritatively, whether a real payment
 *   can be processed in the current deployment.
 *
 * What this file is NOT:
 *   - It does NOT implement, call or fake any real gateway (no URL, no
 *     credential, no request/response contract is invented here).
 *   - It does NOT hide a development/simulation provider behind a real
 *     provider name.
 *
 * Providers:
 *   simulation  — the ONLY provider that can run today. It persists real
 *                 payment rows but moves no money. Allowed in the
 *                 development environment only.
 *   telebirr    — PAUSED: official gateway API documentation and merchant
 *   cbe_birr      credentials are required before the integration contract
 *   mpesa         can even be written. Until then these providers are
 *                 never "configured" and payment processing fails closed.
 *
 * Environment contract (documented in PRODUCTION_DEPLOYMENT.md):
 *   ET_APP_ENV           development|production  (default: development)
 *   ET_PAYMENT_PROVIDER  simulation|telebirr|cbe_birr|mpesa (default unset)
 *
 * Safety guarantee:
 *   In the production environment a simulation provider is REJECTED and an
 *   unset/unknown provider leaves payment processing disabled. The app can
 *   never silently fall back to the development provider.
 */

const ET_APP_ENV_DEVELOPMENT = 'development';
const ET_APP_ENV_PRODUCTION = 'production';

const ET_PAYMENT_PROVIDER_SIMULATION = 'simulation';
const ET_PAYMENT_PROVIDER_TELEBIRR = 'telebirr';
const ET_PAYMENT_PROVIDER_CBE_BIRR = 'cbe_birr';
const ET_PAYMENT_PROVIDER_MPESA = 'mpesa';

/** Human-readable label for the three real mobile-money providers. */
function et_payment_provider_label(string $provider): string
{
    if ($provider === ET_PAYMENT_PROVIDER_TELEBIRR) {
        return 'Telebirr';
    }
    if ($provider === ET_PAYMENT_PROVIDER_CBE_BIRR) {
        return 'CBE Birr';
    }
    if ($provider === ET_PAYMENT_PROVIDER_MPESA) {
        return 'M-Pesa';
    }

    return ucfirst($provider);
}

/**
 * The application environment. Only an explicit 'production' value enables
 * the production safety rules; everything else stays development.
 */
function et_app_env(): string
{
    $env = strtolower(trim((string) getenv('ET_APP_ENV')));

    return $env === ET_APP_ENV_PRODUCTION ? ET_APP_ENV_PRODUCTION : ET_APP_ENV_DEVELOPMENT;
}

/**
 * Authoritative payment provider configuration for THIS deployment.
 *
 * @return array{
 *   provider: ?string, mode: string, configured: bool, integrated: bool,
 *   label: string, reason: string
 * }
 *   provider   the effective provider id (null when none is available)
 *   mode       'simulation' | 'gateway'
 *   configured whether payment processing is allowed right now
 *   integrated whether a real gateway integration exists in this codebase
 *   label      display label
 *   reason     human-readable explanation (contains no secrets)
 */
function et_payment_provider_config(): array
{
    $appEnv = et_app_env();
    $requested = strtolower(trim((string) getenv('ET_PAYMENT_PROVIDER')));

    $known = [
        ET_PAYMENT_PROVIDER_SIMULATION,
        ET_PAYMENT_PROVIDER_TELEBIRR,
        ET_PAYMENT_PROVIDER_CBE_BIRR,
        ET_PAYMENT_PROVIDER_MPESA,
    ];

    /* Explicitly requested simulation. */
    if ($requested === ET_PAYMENT_PROVIDER_SIMULATION) {
        return [
            'provider' => ET_PAYMENT_PROVIDER_SIMULATION,
            'mode' => 'simulation',
            'configured' => $appEnv !== ET_APP_ENV_PRODUCTION,
            'integrated' => false,
            'label' => 'Simulation (development only)',
            'reason' => $appEnv === ET_APP_ENV_PRODUCTION
                ? 'A simulation payment provider is not permitted in the production environment. Configure a real payment gateway first.'
                : 'Development-only simulated payments. No real money is moved; the payment record is persisted for real.',
        ];
    }

    /* A real mobile-money gateway was requested. None of these are
       integrated yet: the official API contract and merchant credentials
       are not available in this repository, so they can never be
       "configured". This is fail-closed on purpose. */
    if (in_array($requested, $known, true)) {
        $providerName = et_payment_provider_label($requested);

        return [
            'provider' => $requested,
            'mode' => 'gateway',
            'configured' => false,
            'integrated' => false,
            'label' => $providerName,
            'reason' => $providerName . ' is not integrated yet. The official gateway API documentation and merchant '
                . 'credentials are required before it can be enabled (see PRODUCTION_DEPLOYMENT.md, ET_' . strtoupper($requested)
                . '_* configuration). Payment processing stays disabled.',
        ];
    }

    /* Unset or unknown ET_PAYMENT_PROVIDER. */
    if ($appEnv === ET_APP_ENV_PRODUCTION) {
        return [
            'provider' => null,
            'mode' => 'gateway',
            'configured' => false,
            'integrated' => false,
            'label' => 'No payment provider',
            'reason' => 'No payment provider is configured for this production environment '
                . '(ET_PAYMENT_PROVIDER is not set to a real gateway). Payment processing is disabled.',
        ];
    }

    /* Development default: the simulation provider is the only safe default. */
    return [
        'provider' => ET_PAYMENT_PROVIDER_SIMULATION,
        'mode' => 'simulation',
        'configured' => true,
        'integrated' => false,
        'label' => 'Simulation (development only)',
        'reason' => 'Development-only simulated payments. No real money is moved; the payment record is persisted for real.',
    ];
}

/** True when a real payment can be processed in this deployment. */
function et_payment_gateway_configured(): bool
{
    return et_payment_provider_config()['configured'];
}

/**
 * Safe presentation subset for API responses — never exposes secrets,
 * environment internals or DB credentials, only the effective mode state.
 */
function et_payment_gateway_info(): array
{
    $cfg = et_payment_provider_config();

    return [
        'provider' => $cfg['provider'],
        'mode' => $cfg['mode'],
        'configured' => $cfg['configured'],
        'integrated' => $cfg['integrated'],
        'label' => $cfg['label'],
    ];
}
