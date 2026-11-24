import { MongoClient, ObjectId } from 'mongodb'
import { z } from 'zod'

const request = z.enum(['create', 'list', 'get', 'update', 'delete']).parse(process.argv[2] ?? 'list')
const input = process.argv[3]
const updateTitle = process.argv[4]
const titleSchema = z.string().trim().min(1).max(200)
const url = process.env.MONGO_URL ?? 'mongodb://localhost:27017/tanstack_study'

const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 })
try {
  await client.connect()
  const posts = client.db().collection('study_posts')
  await posts.createIndex({ createdAt: -1, _id: -1 })

  switch (request) {
    case 'create': console.log(await posts.insertOne({ title: titleSchema.parse(input), createdAt: new Date() })); break
    case 'list': console.log(await posts.find().sort({ createdAt: -1, _id: -1 }).limit(10).toArray()); break
    case 'get': console.log(await posts.findOne({ _id: ObjectId.createFromHexString(input) })); break
    case 'update': console.log(await posts.updateOne({ _id: ObjectId.createFromHexString(input) },
      { $set: { title: titleSchema.parse(updateTitle), updatedAt: new Date() } })); break
    case 'delete': console.log(await posts.deleteOne({ _id: ObjectId.createFromHexString(input) })); break
  }
} finally { await client.close() }
