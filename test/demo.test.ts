import { describe, test } from 'node:test';
import { MarkdownChunk, SplitterOptions, TAG_H2 } from '@mdream/js';
import { withMinimalPreset } from '@mdream/js/preset/minimal';
import { htmlToMarkdownSplitChunksStream } from '@mdream/js/splitter';





class Chunk {
  constructor(
   public chunk:MarkdownChunk
  ) {}
}

class Document {
  public chunks = new Set<Chunk>();
  constructor(public url: URL) {}
  addChunk(chunk: Chunk) {
    this.chunks.add(chunk);
  }
}

class Store {

  public documents = new Map<string, Document>();
  constructor() {
  }

  addDocument(document: Document) {
    this.documents.set(document.url.toString(), document);
  }

}



test('stuff', async ()=>{
  const store = new Store();
const url = new URL('https://en.wikipedia.org/wiki/List_of_WWE_personnel')
  const html = await fetch(url
    ,
  ).then(x => x.text());
  const document = new Document(url);
  store.addDocument(document);
const options = withMinimalPreset({
  origin: url.origin,
  lengthFunction: (chunk: string) => chunk.length / 4,
  clean: true,
  chunkSize: 10000
}) as SplitterOptions;
console.time('stream')
  for (const chunk of htmlToMarkdownSplitChunksStream(html,options)) {
    document.addChunk(new Chunk(chunk));
  }
console.timeEnd('stream')
  console.log(document.chunks.size);

})
