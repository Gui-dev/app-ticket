export function formatAuthError(code: string | null | undefined): string {
  switch (code) {
    case 'EMAIL_NOT_VERIFIED':
      return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'E-mail ou senha inválidos.';
    case 'PASSWORD_TOO_SHORT':
      return 'A senha deve ter pelo menos 8 caracteres.';
    case 'INVALID_TOKEN':
      return 'Link expirado ou inválido. Solicite um novo.';
    default:
      return 'Não foi possível continuar. Tente novamente.';
  }
}
