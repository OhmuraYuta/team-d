// APIクライアントのバレルエクスポート。
// 画面側からは `import { searchEmployees, login } from "@/lib/api"` で利用できる。
export { USE_MOCK, API_BASE, ApiError } from "./client";
export { login, logout } from "./auth";
export { searchEmployees, getEmployee } from "./employees";
export { getLatestMessages, sendMessage } from "./messages";
export { getDepartments, getLocations, getPositions, getSeats } from "./masters";
export {
  getAdminEmployees,
  unlockUser,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  updateMaxFailedAttempts,
  createSeat,
  updateSeat,
  deleteSeat,
} from "./admin";
