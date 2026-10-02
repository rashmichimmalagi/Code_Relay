export type TeamStatus = "PENDING" | "APPROVED" | "REJECTED";

export type UserRole = "STUDENT" | "ADMIN" | "SUPER_ADMIN";

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface Team {
  id: string;
  team_number: number;
  team_name: string;
  created_by: string;
  student_1_name: string;
  student_2_name: string;
  student_3_name: string;
  status: TeamStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}