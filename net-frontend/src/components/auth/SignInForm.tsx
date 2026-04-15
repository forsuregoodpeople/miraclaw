"use client";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { SweetAlert } from "@/lib/sweetalert";
import getRandomQuote, { Quote } from "@/lib/quote";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, LoginFormData } from "@/lib/schema";
import { useAuth } from "@/context/AuthContext";

export default function SignInForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: "",
      password: "",
    },
  });

  useEffect(() => {
    setQuote(getRandomQuote());
  }, []);

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      await login(data.identifier, data.password);

      SweetAlert.success("Login Berhasil!", "Selamat datang!");
      router.push("/dashboard");
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Login gagal";
      SweetAlert.error("Login Gagal!", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row w-screen h-screen overflow-hidden">
      <div className="flex flex-col flex-1 lg:w-1/2 w-full p-6 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
        </div>
        <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto min-h-0">
          <div>
            <div className="mb-5 text-center sm:mb-8">
              <Image src="/images/logo.png" className="mx-auto py-8" alt="alt" width={140} height={140} />
              <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
                Masuk ke akun Anda
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sistem Monitoring Jaringan - ACI Data Solusindo
              </p>
            </div>
            <div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
              </div>
               <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <div className="space-y-6">
                  <div>
                    <Label>
                      Username <span className="text-error-500">*</span>{" "}
                    </Label>
                    <Input
                      placeholder="admin atau admin@example.com" 
                      type="text" 
                      {...register("identifier")}
                      error={!!errors.identifier}
                      hint={errors.identifier?.message}
                    />
                  </div>
                  <div>
                    <Label>
                      Password <span className="text-error-500">*</span>{" "}
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        {...register("password")}
                        error={!!errors.password}
                        hint={errors.password?.message}
                      />
                      <span
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                      >
                        {showPassword ? (
                          <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                        ) : (
                          <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Checkbox checked={isChecked} onChange={setIsChecked} />
                      <span className="block font-normal text-gray-700 text-theme-sm dark:text-gray-400">
                       Ingat Saya
                      </span>
                    </div>

                  </div>
                  <div>
                    <Button 
                      className="w-full" 
                      size="sm"
                      type="submit"
                      disabled={isLoading}
                    >
                      {isLoading ? "Memproses..." : "Masuk"}
                    </Button>
                  </div>
                </div>
              </form>

              <div className="mt-5">
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 lg:w-1/2 w-full hidden lg:block bg-gray-100 dark:bg-gray-800 relative">
        <Image
          src="/images/hacker.png"
          alt="Hacker Illustration"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-12">
          <div className="text-center max-w-xl">
            <svg className="w-12 h-12 mx-auto mb-6 text-white/80" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
            </svg>
            {quote && (
              <>
                <blockquote className="text-2xl font-semibold text-white mb-4 leading-relaxed">
                  "{quote.text}"
                </blockquote>
                <cite className="text-white/70 text-sm not-italic">— {quote.author}</cite>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
