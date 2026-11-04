import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  throw redirect(`/app/submissions${url.search}`);
};

export default function SubmissionsRedirect() {
  return null;
}
