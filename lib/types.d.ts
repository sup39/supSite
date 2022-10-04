export type FileCompiler =
  (src: string, dst: string, nav: string) => void|PromiseLike<void>;

export type Rule = {
  test: RegExp
  output: string
  compile: FileCompiler
}
export type SiteOptions = {
  name: string
  root?: string
  dirinfoName?: string
  indexName?: string
  rules?: Rule[]
}

export type NavItemConfig = {
  title: string
  src: string
}
export type Dirinfo = {
  nav: NavItemConfig[]
  static?: string[]
}
