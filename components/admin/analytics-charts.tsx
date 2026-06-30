"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardHeader } from "@/components/ui/card";

export function SignupsChart({ data }: { data: { month: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader title="New students" description="Sign-ups over the last 6 months." />
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ left: -20, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" fontSize={12} stroke="#94a3b8" />
          <YAxis allowDecimals={false} fontSize={12} stroke="#94a3b8" />
          <Tooltip />
          <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function EnrollmentsChart({ data }: { data: { course: string; enrolled: number; completed: number }[] }) {
  return (
    <Card>
      <CardHeader title="Enrollment & completion" description="Per course." />
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ left: -20, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="course" fontSize={11} stroke="#94a3b8" />
          <YAxis allowDecimals={false} fontSize={12} stroke="#94a3b8" />
          <Tooltip />
          <Bar dataKey="enrolled" fill="#93c5fd" radius={[4, 4, 0, 0]} />
          <Bar dataKey="completed" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
