export type Role = "EMPLOYEE" | "ADMIN";

export interface AuthUser {
  id: string; // UUIDv7
  employeeId: string;
  lastName: string;
  firstName: string;
  role: Role;
}

export interface LoginRequestBody {
  employeeId?: string;
  password?: string;
}

export interface LoginSuccessResponse {
  success: true;
  user: AuthUser;
}

export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
}

export interface JwtCustomPayload {
  id: string;
  employeeId: string;
  role: Role;
}
