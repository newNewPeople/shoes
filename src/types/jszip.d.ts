declare module 'jszip' {
  interface JSZipObject {
    async(type: 'blob' | 'text' | 'arraybuffer'): Promise<Blob | string | ArrayBuffer>
    name: string
    dir: boolean
  }
  
  interface JSZip {
    loadAsync(data: File | Blob | ArrayBuffer): Promise<this>
    file(path: string): JSZipObject | null
    files: Record<string, JSZipObject>
  }
  
  interface JSZipConstructor {
    new(): JSZip
    (): JSZip
  }
  
  const JSZip: JSZipConstructor
  export default JSZip
}