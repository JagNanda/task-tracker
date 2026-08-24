import { CalendarDays, Flag } from "lucide-react";
import { Button } from "../../cdk";

export function TodayHeader({ onEndDay }: { onEndDay: () => void }) {
  return (
    <header className="today-header">
      <div className="today-header__date">
        <CalendarDays size={22} aria-hidden="true" />
        <div>
          <h1>Wednesday, May 15</h1>
          <p>Week 20 <span>•</span> Day 135 of 2024</p>
        </div>
      </div>
      <div className="today-header__actions">
        <Button size="md" onClick={onEndDay}><Flag size={17} /> End Day</Button>
      </div>
    </header>
  );
}
