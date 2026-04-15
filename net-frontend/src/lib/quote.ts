export interface Quote {
  text: string;
  author: string;
}

const quotes: Quote[] = [
  {
    text: "Satu-satunya cara untuk melakukan pekerjaan hebat adalah dengan mencintai apa yang Anda lakukan.",
    author: "Steve Jobs",
  },
  {
    text: "Jangan takut gagal. Takutlah untuk tidak mencoba.",
    author: "Roy T. Bennett",
  },
  {
    text: "Cara terbaik untuk memprediksi masa depan adalah dengan menciptakannya.",
    author: "Peter Drucker",
  },
  {
    text: "Peluang tidak datang. Itu adalah yang Anda buat sendiri.",
    author: "Chris Grosser",
  },
  {
    text: "Orang sukses melakukan apa yang orang gagal tidak mau lakukan.",
    author: "Jim Rohn",
  },
  {
    text: "Jangan menunggu. Waktu tidak akan pernah menjadi tepat.",
    author: "Napoleon Hill",
  },
  {
    text: "Inovasi membedakan antara pemimpin dan pengikut.",
    author: "Steve Jobs",
  },
  {
    text: "Investasi dalam pengetahuan membayar bunga terbaik.",
    author: "Benjamin Franklin",
  },
  {
    text: "Fokus pada solusi, bukan pada masalah.",
    author: "Anonymous",
  },
  {
    text: "Kesuksesan adalah hasil dari persiapan, kerja keras, dan belajar dari kegagalan.",
    author: "Colin Powell",
  },
  {
    text: "Pelanggan tidak selalu benar, tetapi mereka harus selalu dimenangkan.",
    author: "Anonymous",
  },
  {
    text: "Delegasikan tugas, bukan tanggung jawab.",
    author: "Stephen Covey",
  },
  {
    text: "Cash flow adalah raja dalam bisnis.",
    author: "Anonymous",
  },
  {
    text: "Dengarkan pelanggan Anda. Mereka akan memberi tahu Anda apa yang mereka butuhkan.",
    author: "Anonymous",
  },
  {
    text: "Jangan bersaing dengan harga, bersainglah dengan nilai.",
    author: "Anonymous",
  },
  {
    text: "Kegagalan adalah kesempatan untuk memulai lagi dengan lebih cerdas.",
    author: "Henry Ford",
  },
  {
    text: "Bangun sistem yang bisa berjalan tanpa Anda.",
    author: "Michael Gerber",
  },
  {
    text: "Marketing yang baik membuat perusahaan terlihat pintar. Marketing yang hebat membuat pelanggan merasa pintar.",
    author: "Joe Chernov",
  },
  {
    text: "Jangan pernah berhenti belajar, karena hidup tidak pernah berhenti mengajar.",
    author: "Anonymous",
  },
  {
    text: "Reputasi yang baik lebih berharga daripada uang.",
    author: "Publilius Syrus",
  },
  {
    text: "Kepercayaan adalah mata uang paling berharga dalam bisnis.",
    author: "Anonymous",
  },
  {
    text: "Mulai dari yang kecil, tetapi berpikir besar.",
    author: "Anonymous",
  },
  {
    text: "Kualitas produk adalah iklan terbaik Anda.",
    author: "Anonymous",
  },
  {
    text: "Jangan takut untuk pivot ketika strategi tidak berjalan.",
    author: "Anonymous",
  },
  {
    text: "Networking adalah investasi jangka panjang untuk kesuksesan bisnis.",
    author: "Anonymous",
  },
];

export const getRandomQuote = (): Quote => {
  const randomIndex = Math.floor(Math.random() * quotes.length);
  return quotes[randomIndex];
};

export const quotesList = quotes;

export default getRandomQuote;