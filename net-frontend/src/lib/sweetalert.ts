import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

export const SweetAlert = {
  fire: (config: any) => {
    return Swal.fire(config);
  },

  success: (title: string, message?: string) => {
    return Swal.fire({
      icon: "success",
      title: title === "Success" ? "Berhasil" : title,
      text: message,
      timer: 3000,
      timerProgressBar: true,
      showConfirmButton: false,
    });
  },

  error: (title: string, message?: string) => {
    return Swal.fire({
      icon: "error",
      title: title === "Error" ? "Terjadi Kesalahan" : title,
      text: message,
      timer: 3000,
      timerProgressBar: true,
      showConfirmButton: false,
    });
  },

  warning: (title: string, message?: string) => {
    return Swal.fire({
      icon: "warning",
      title: title === "Warning" ? "Peringatan" : title === "Info" ? "Informasi" : title,
      text: message,
      timer: 3000,
      timerProgressBar: true,
      showConfirmButton: false,
    });
  },

  info: (title: string, message?: string) => {
    return Swal.fire({
      icon: "info",
      title: title === "Info" ? "Informasi" : title,
      text: message,
      timer: 3000,
      timerProgressBar: true,
      showConfirmButton: false,
    });
  },

  confirm: (
    title: string,
    message: string,
    onConfirm?: () => void,
    onCancel?: () => void
  ) => {
    return Swal.fire({
      icon: "warning",
      title,
      text: message,
      showCancelButton: true,
      confirmButtonText: "Konfirmasi",
      cancelButtonText: "Batal",
    }).then((result: any) => {
      if (result.isConfirmed && onConfirm) {
        onConfirm();
      } else if (result.isDismissed && onCancel) {
        onCancel();
      }
      return result;
    });
  },

  Toast: {
    success: (message: string, timer: number = 3000) => {
      return Swal.fire({
        icon: "success",
        title: message,
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer,
        timerProgressBar: true,
      });
    },
    error: (message: string, timer: number = 3000) => {
      return Swal.fire({
        icon: "error",
        title: message,
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer,
        timerProgressBar: true,
      });
    },
    warning: (message: string, timer: number = 3000) => {
      return Swal.fire({
        icon: "warning",
        title: message,
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer,
        timerProgressBar: true,
      });
    },
    info: (message: string, timer: number = 3000) => {
      return Swal.fire({
        icon: "info",
        title: message,
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer,
        timerProgressBar: true,
      });
    },
  },
};

export default SweetAlert;
