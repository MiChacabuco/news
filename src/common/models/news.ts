import { NewsSource } from "./news-source";

export interface News {
  Id: number;
  Source: string | Partial<NewsSource>;
  Title: string;
  Summary: string;
  Link: string;
  Image?: string;
  CreatedAt: number;
}

interface RenderedString {
  rendered: string;
}

export interface NewsWP {
  id: number;
  title: RenderedString;
  content: RenderedString;
  link: string;
  date_gmt: string;
  _links: {
    "wp:featuredmedia": { href: string }[];
  };
}
