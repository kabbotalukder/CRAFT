import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard/courses")({
  component: CoursesLayout,
});

function CoursesLayout() {
  return <Outlet />;
}
