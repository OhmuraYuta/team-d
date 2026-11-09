"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getLocations, getSeats } from "@/lib/api/masters";
import { getEmployee } from "@/lib/api/employees";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth-context";
import type { EmployeeDetail, FloorMapSeat, MasterItem } from "@/lib/types";

const defaultFloor = "4F";

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
  const displayedSeats = apiSeats.map((seat) => [seat.seatCode, seat.x, seat.y] as const);

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
    <div className="-mx-4 -my-5 h-[calc(100vh-51px)] min-w-0 overflow-hidden bg-[#efefef] text-black lg:-mx-8 lg:-my-6">
      <section className="h-full min-w-0 overflow-hidden">
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
                  <button key={code} type="button" aria-label={`座席 ${code}`} onClick={() => selectSeat(code)} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-[5px] bg-white/60 px-2 py-0.5 text-[20px] leading-normal transition hover:bg-white/90 ${selectedCode === code ? "z-10 ring-4 ring-[#1750a8] ring-offset-2" : ""}`} style={{ left: `${x}%`, top: `${y}%` }}>
                    {code}
                  </button>
                ))}
              </div>
            </div>

            <EmployeeCard employee={selectedEmployee} seatCode={selectedCode} />
          </div>
        </div>
      </section>
    </div>
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
      <div className="mt-[20px] border-t border-black/25 pt-[20px]" />
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
      <Link href={employee ? `/employees/${employee.id}` : "#"} aria-disabled={!employee} className={`relative mt-auto flex h-[40px] w-full items-center justify-center rounded-[5px] bg-[#1750a8] text-[16px] font-bold text-white ${employee ? "" : "pointer-events-none opacity-50"}`}>
        <span>社員の詳細を見る</span>
        <span aria-hidden="true" className="absolute right-[17px] top-1/2 h-[9px] w-[9px] -translate-y-1/2 rotate-45 rounded-[1px] border-r-2 border-t-2 border-white" />
      </Link>
    </aside>
  );
}
