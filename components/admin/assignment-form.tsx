"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const COURSE_LEVEL = "__course_level__";

export type AssignmentCourseOption = { id: string; title: string };
export type AssignmentModuleOption = { id: string; title: string; course_id: string };

export function AssignmentForm({
  courses,
  modules,
  createAction,
}: {
  courses: AssignmentCourseOption[];
  modules: AssignmentModuleOption[];
  createAction: (formData: FormData) => Promise<void>;
}) {
  const [courseId, setCourseId] = useState("");
  const [moduleId, setModuleId] = useState(COURSE_LEVEL);

  const filteredModules = useMemo(
    () => (courseId ? modules.filter((module) => module.course_id === courseId) : []),
    [courseId, modules],
  );

  return (
    <form action={createAction} className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label>Course</Label>
        <Select
          name="course_id"
          required
          value={courseId}
          onChange={(event) => {
            setCourseId(event.target.value);
            setModuleId(COURSE_LEVEL);
          }}
        >
          <option value="">Select a course…</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Module</Label>
        <input
          type="hidden"
          name="module_id"
          value={moduleId === COURSE_LEVEL ? "" : moduleId}
        />
        <Select
          value={moduleId}
          disabled={!courseId}
          onChange={(event) => setModuleId(event.target.value)}
        >
          <option value={COURSE_LEVEL}>No specific module (course-level)</option>
          {filteredModules.map((module) => (
            <option key={module.id} value={module.id}>
              {module.title}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Title</Label>
        <Input name="title" required />
      </div>
      <div>
        <Label>Due date</Label>
        <Input name="due_date" type="datetime-local" />
      </div>
      <div className="sm:col-span-2">
        <Label>Instructions</Label>
        <Textarea name="instructions" rows={3} />
      </div>
      <div className="sm:col-span-2">
        <Label>Allowed submission types</Label>
        <div className="flex flex-wrap gap-3 pt-2 text-sm">
          {["file", "text", "link", "video"].map((type) => (
            <label key={type} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="submission_types"
                value={type}
                defaultChecked={type === "file" || type === "text"}
              />
              {type}
            </label>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit">
          <Plus className="h-4 w-4" /> Create draft assignment
        </Button>
        <p className="mt-2 text-xs text-muted">
          Saved as a draft. Students will not see it until you publish.
        </p>
      </div>
    </form>
  );
}
