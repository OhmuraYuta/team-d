import { Role } from "./auth";

export interface EmployeeExperienceInput {
  projectName: string;
  roleDescription?: string;
  startDate?: string;
  endDate?: string;
}

export interface EmployeeCreateInput {
  loginId: string;
  password: string;
  lastName: string;
  firstName: string;
  email: string;
  role?: Role;
  departmentId?: string | null;
  locationId?: string | null;
  positionId?: string | null;
  seatId?: string | null;
  photoUrl?: string | null;
  selfPR?: string | null;
  hobbyInfo?: string | null;
  skills?: string[];
  credentials?: string[];
  experiences?: EmployeeExperienceInput[];
}

export interface EmployeeCreateResponse {
  success: boolean;
  id: string;
  message: string;
}
