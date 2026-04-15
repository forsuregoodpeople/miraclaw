import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Net Monitoring",
  description: "ACI Data Solusindo",
};

export default function SignIn() {
  return <SignInForm />;
}
