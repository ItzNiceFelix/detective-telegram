export type StatusHasil = "berhasil" | "gagal";

export type HasilOperasi<T, E = Error> =
  | {
      status: "berhasil";
      data: T;
    }
  | {
      status: "gagal";
      error: E;
    };

export function berhasil<T>(data: T): HasilOperasi<T, never> {
  return { status: "berhasil", data };
}

export function gagal<E>(error: E): HasilOperasi<never, E> {
  return { status: "gagal", error };
}

export function apakahBerhasil<T, E>(hasil: HasilOperasi<T, E>): hasil is { status: "berhasil"; data: T } {
  return hasil.status === "berhasil";
}
