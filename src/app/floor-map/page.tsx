"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getLocations, getSeats } from "@/lib/api/masters";
import { getEmployee } from "@/lib/api/employees";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth-context";
import type { EmployeeDetail, FloorMapSeat, MasterItem } from "@/lib/types";

const designSeats = [
  ["A-1", 10, 8], ["A-2", 16, 8], ["A-3", 22, 8], ["A-4", 28, 8],
  ["B-1", 38, 8], ["B-2", 44, 8], ["B-3", 50, 8], ["B-4", 56, 8],
  ["A-5", 10, 27], ["A-6", 16, 27], ["A-7", 22, 27], ["A-8", 28, 27],
  ["B-5", 38, 27], ["B-6", 44, 27], ["B-7", 50, 27], ["B-8", 56, 27],
  ["C-1", 3, 34], ["C-2", 9, 34], ["C-3", 3, 57], ["C-4", 9, 57],
  ["D-1", 25, 34], ["D-2", 31, 34], ["D-3", 37, 34], ["D-5", 25, 57], ["D-6", 31, 57], ["D-7", 37, 57],
  ["E-1", 66, 34], ["E-2", 72, 34], ["E-3", 66, 57], ["E-4", 72, 57],
  ["F-1", 10, 78], ["F-2", 16, 78], ["F-3", 22, 78], ["F-4", 28, 78],
  ["G-1", 38, 78], ["G-2", 44, 78], ["G-3", 50, 78], ["G-4", 56, 78],
  ["F-5", 10, 97], ["F-6", 16, 97], ["F-7", 22, 97], ["F-8", 28, 97],
  ["G-5", 38, 97], ["G-6", 44, 97], ["G-7", 50, 97], ["G-8", 56, 97],
] as const;

const defaultFloor = "4F";

function SideIcon({ src }: { src: string }) {
  return <img src={src} alt="" className="h-[20px] w-[20px] object-contain" />;
}

export default function FloorMapPage() {
  const router = useRouter();
  const { user, isReady } = useAuth();
  const [locations, setLocations] = useState<MasterItem[]>([]);
  const [locationId, setLocationId] = useState("");
  const [floor, setFloor] = useState(defaultFloor);
  const [floorsByLocation, setFloorsByLocation] = useState<Record<string, string[]>>({});
  const [expandedLocationIds, setExpandedLocationIds] = useState<string[]>([]);
  const [apiSeats, setApiSeats] = useState<FloorMapSeat[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeDetail | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    async function loadFloorData() {
      try {
        const items = await getLocations();
        if (cancelled) return;
        setLocations(items);
        if (items[0]) setLocationId(items[0].id);
        setExpandedLocationIds(items[0] ? [items[0].id] : []);
        const entries = await Promise.all(items.map(async (location) => [location.id, await getSeats(location.id)] as const));
        if (cancelled) return;
        const floors = Object.fromEntries(entries.map(([id, seats]) => [id, [...new Set(seats.map((seat) => seat.floor))]]));
        setFloorsByLocation(floors);
        const firstLocationFloors = floors[items[0]?.id] ?? [];
        if (firstLocationFloors[0] && !firstLocationFloors.includes(defaultFloor)) setFloor(firstLocationFloors[0]);
      } catch (error) {
        if (!cancelled && error instanceof ApiError && error.status === 401) router.replace("/login");
      }
    }
    void loadFloorData();
    return () => {
      cancelled = true;
    };
  }, [isReady, router, user]);

  useEffect(() => {
    if (!user || !locationId) return;
    const floors = floorsByLocation[locationId] ?? [];
    const nextFloor = floors.includes(floor) ? floor : floors[0];
    if (!nextFloor) return;
    let cancelled = false;
    void getSeats(locationId, nextFloor)
      .then((seats) => {
        if (cancelled) return;
        setApiSeats(seats);
        const firstAssignedSeat = seats.find((seat) => seat.employee);
        if (!firstAssignedSeat?.employee) {
          setSelectedCode("");
          setSelectedEmployee(null);
          return;
        }
        setSelectedCode(firstAssignedSeat.seatCode);
        void getEmployee(firstAssignedSeat.employee.id)
          .then(setSelectedEmployee)
          .catch((error: unknown) => {
            if (!cancelled && error instanceof ApiError && error.status === 401) router.replace("/login");
          });
      })
      .catch((error: unknown) => {
        if (!cancelled && error instanceof ApiError && error.status === 401) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [floor, floorsByLocation, locationId, router, user]);

  const locationName = locations.find((location) => location.id === locationId)?.name ?? "東京本社";
  const displayedSeats = useMemo(() => {
    if (!apiSeats.length) return designSeats;
    return apiSeats.map((seat) => [seat.seatCode, seat.x, seat.y] as const);
  }, [apiSeats]);

  const selectSeat = (code: string) => {
    setSelectedCode(code);
    const seat = apiSeats.find((candidate) => candidate.seatCode === code);
    if (seat?.employee) {
      void getEmployee(seat.employee.id)
        .then(setSelectedEmployee)
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401) router.replace("/login");
        });
    } else {
      setSelectedEmployee(null);
    }
  };

  return (
    <main className="h-screen min-w-0 overflow-hidden bg-[#efefef] text-black">
      <header className="fixed inset-x-0 top-0 z-20 h-[51px] bg-[#1a2b4a]">
        <div className="relative h-full w-[255px] overflow-hidden">
          <img src="/images/floormap/logo.png" alt="社員情報活用システム" className="absolute left-[-3.28%] top-[-106.75%] h-[341.59%] w-[109.38%] max-w-none" />
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-[51px] z-10 w-[200px] bg-[#1a2b4a] text-white">
        {[
          ["ホーム", "home.svg"],
          ["社員検索", "search.svg"],
          ["フロアマップ", "map.svg"],
          ["管理者メニュー", "admin.svg"],
        ].map(([label, icon], index) => (
          <div key={label} className={`flex h-[50px] items-center gap-5 px-5 text-[14px] font-medium ${index === 2 ? "bg-[#3f4966]" : ""}`}>
            <SideIcon src={`/images/floormap/${icon}`} />
            <span>{label}</span>
          </div>
        ))}
      </aside>

      <section className="ml-[200px] h-screen min-w-0 overflow-hidden pt-[51px]">
        <h1 className="h-[76px] px-6 pt-[55px] text-[16px] font-normal">フロアマップ</h1>
        <div className="mx-6 flex h-[calc(100vh-127px)] min-h-0 overflow-hidden rounded-[10px] bg-white shadow-sm">
          <nav className="w-[175px] shrink-0 border border-black/25 bg-white">
            <p className="pt-[9px] text-center text-[16px]">拠点選択</p>
            <div className="mt-[30px]">
              {locations.map((location) => {
                const isSelected = location.id === locationId;
                const isExpanded = expandedLocationIds.includes(location.id);
                const locationFloors = floorsByLocation[location.id] ?? [];
                return (
                  <div key={location.id}>
                    <button type="button" onClick={() => { setLocationId(location.id); if (locationFloors[0]) setFloor(locationFloors[0]); setExpandedLocationIds((current) => current.includes(location.id) ? current.filter((id) => id !== location.id) : [...current, location.id]); }} className="flex w-full items-center justify-between px-[30px] py-[10px] text-left text-[16px]">
                      <span>{location.name}</span><span aria-hidden="true" className={`mr-[2px] inline-block h-[7px] w-[7px] border-b border-r border-black transition-transform ${isExpanded ? "-rotate-[135deg] translate-y-[2px]" : "rotate-45 -translate-y-[2px]"}`} />
                    </button>
                    {isExpanded && locationFloors.map((item) => (
                      <button key={item} type="button" onClick={() => { setLocationId(location.id); setFloor(item); }} className={`block h-[39px] w-full px-[30px] py-[10px] text-center text-[16px] ${isSelected && floor === item ? "bg-[#d9d9d9]" : "bg-white"}`}>
                        {item}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </nav>

          <div className="flex min-h-0 min-w-0 flex-1 gap-[36px] overflow-hidden border-b border-r border-t border-black/25 p-[30px]">
            <div className="relative min-w-0 flex-1 overflow-hidden rounded-[5px] bg-[#d7bc94] shadow-sm">
              <img src="/images/floormap/floor-map.png" alt={`${locationName} ${floor} フロア図`} className="absolute left-[-13.83%] top-0 h-full w-[128.55%] max-w-none" />
              <div className="absolute inset-0">
                {displayedSeats.map(([code, x, y]) => (
                  <button key={code} type="button" aria-label={`座席 ${code}`} onClick={() => selectSeat(code)} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-[5px] bg-white/60 px-2 py-0.5 text-[24px] leading-normal transition hover:bg-white/90 ${selectedCode === code ? "z-10 ring-4 ring-[#1750a8] ring-offset-2" : ""}`} style={{ left: `${x}%`, top: `${y}%` }}>
                    {code}
                  </button>
                ))}
              </div>
            </div>

            <EmployeeCard employee={selectedEmployee} seatCode={selectedCode} />
          </div>
        </div>
      </section>
    </main>
  );
}

function EmployeeCard({ employee, seatCode }: { employee: EmployeeDetail | null; seatCode: string }) {
  const displayName = employee ? `${employee.lastName} ${employee.firstName}` : "社員未選択";
  return (
    <aside className="flex h-full w-[431px] shrink-0 flex-col overflow-hidden rounded-[10px] border border-black/25 bg-white px-[25px] pb-[14px] shadow-[0_4px_4px_rgba(0,0,0,0.25)]">
      <h2 className="pt-[10px] text-[16px] font-normal">選択中の社員情報</h2>
      <div className="mt-[38px] grid grid-cols-[150px_1fr] gap-[70px]">
        <div className="flex h-[150px] w-[150px] items-center justify-center overflow-hidden rounded-[10px] border border-black text-[24px]">
        {employee?.photoUrl ? <img src={employee.photoUrl} alt={displayName} className="h-full w-full object-cover" /> : "顔写真"}
        </div>
        <div className="min-w-0">
          <p className="text-[16px]">座席番号</p><p className="text-[24px]">{seatCode || "—"}</p>
          <p className="mt-[8px] whitespace-nowrap text-[20px]">{displayName}</p>
          <p className="mt-[12px] text-left text-[16px]">社員ID<br /><span className="text-[12px]">{employee?.employeeId ?? "—"}</span></p>
        </div>
      </div>
      <div className="mt-[20px] border-t border-black/25 pt-[6px]" />
      <div className="grid grid-cols-[130px_1fr] gap-y-[20px] text-[16px]">
        <span>部署</span><span>{employee?.department ?? "—"}</span>
        <span>社内メール</span><span className="whitespace-nowrap text-[14px]">{employee?.email ?? "—"}</span>
      </div>
      <div className="mt-[20px] text-[16px]">
        <p>資格</p><p className="mt-1 text-[12px] leading-normal">{employee?.credentials.length ? employee.credentials.map((credential) => <span key={credential} className="block">・{credential}</span>) : "—"}</p>
      </div>
      <div className="mt-[20px]">
        <p className="text-[16px]">スキル</p>
        <div className="mt-[12px] grid grid-cols-4 gap-x-[30px] gap-y-[20px]">
          {employee?.skills.length ? employee.skills.map((skill) => <span key={skill} className="flex h-[33px] items-center justify-center rounded-[5px] bg-[#eef3fd] px-[10px] text-center text-[12px] font-bold text-[#1e5fc2]">{skill}</span>) : <span>—</span>}
        </div>
      </div>
      <button type="button" className="mt-auto flex h-[40px] w-full items-center justify-center rounded-[5px] bg-[#1750a8] text-[16px] font-bold text-white">
        社員の詳細を見る <span className="ml-auto">›</span>
      </button>
    </aside>
  );
}
