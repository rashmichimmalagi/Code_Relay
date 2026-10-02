import { insforge } from "./insforge";

export async function getMyTeam(
  userId: string,
) {
  const result =
    await insforge.database
      .from("teams")
      .select("*")
      .eq("created_by", userId);

  if (result.error) {
    console.error(
      "Unable to load student's team:",
      result.error,
    );

    return {
      team: null,
      error: result.error,
    };
  }

  const teams = result.data ?? [];

  return {
    team: teams.length > 0
      ? teams[0]
      : null,
    error: null,
  };
}

export async function createTeam({
  teamNumber,
  teamName,
  createdBy,
  student1Name,
  student2Name,
  student3Name,
}: {
  teamNumber: number;
  teamName: string;
  createdBy: string;
  student1Name: string;
  student2Name: string;
  student3Name: string;
}) {
  const result =
    await insforge.database
      .from("teams")
      .insert({
        team_number: teamNumber,
        team_name: teamName,
        created_by: createdBy,
        student_1_name: student1Name,
        student_2_name: student2Name,
        student_3_name: student3Name,
        status: "PENDING",
      })
      .select()
      .maybeSingle();

  return {
    team: result.data ?? null,
    error: result.error ?? null,
  };
}