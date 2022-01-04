/*
    OneTable Overview -- in JavaScript

    If using typescript, see the 'typescript' overview sample.
    This sample runs its own local dynamodb instance on port 4567.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import DynamoDbLocal from 'dynamo-db-local'

//  For AWS V3
// import Dynamo from 'dynamodb-onetable/Dynamo'
// import { Table } from 'dynamodb-onetable'

//  Use local source when debugging
import Dynamo from '../../../dist/mjs/Dynamo.js'
import { Table } from '../../../dist/mjs/index.js'

/*
    Import the OneTable schema
*/
import Schema from './schema.js'

//  Local DynamoDB connection port
const PORT = 4567

//  Create a client using the AWS V3 helper
const client = new Dynamo({
    client: new DynamoDBClient({
        region: 'local',
        endpoint: `http://localhost:${PORT}`,
    })
})

//  Crypto setup for to add additional encryption layer of email addresses
const Crypto = {
    "primary": {
        "cipher": "aes-256-gcm",
        "password": "1a22a-d27c9-12342-5f7bc-1a716-fc73e"
    }
}

/*
    Single-table schema and setup. This is used for general access and by `createTable`
 */
const table = new Table({
    name: 'TestOverview',
    client: client,
    crypto: Crypto,
    uuid: 'ulid',
    logger: true,
    timestamps: true,
    isoDates: true,
    schema: Schema,
})

let dynamodb = null

async function start() {
    //  Start the dynamodb instance and then short wait for it to open a listening port.
    dynamodb = DynamoDbLocal.spawn({port: PORT})
    await delay(1000)
}

async function stop() {
    //  Stop the local test dynamodb instance
    process.kill(dynamodb.pid)
}

async function test() {
    /*
        For this sample, create the table. Normally would be created separately.
    */
    await table.createTable()

    /*
        Get OneTable entities. You can use these models for create/read/write etc. Or you can use table.*('Account').
    */
    const Account = table.getModel('Account')
    const Invoice = table.getModel('Invoice')
    const Product = table.getModel('Product')
    const User = table.getModel('User')

    /*
        Create account. This will allocate an account ID (ULID) and create item in primary and
        secondary index.
    */
    let account = await Account.create({name: 'Acme Rockets'})

    /*
        Add account ID to context. This will be blended with all API properties.
    */
    table.setContext({accountId: account.id})

    /*
        Create user. This will allocate a user ID, get the accountId from the context.
     */
    let user = await User.create({name: 'Road Runner', email: 'roadrunner@acme.com', address: {}})

    user = await User.get({email: 'roadrunner@acme.com'})

    /*
        Fetch user via name using the GSI. Follow will automatically follow the GSI to fetch the full item from the primary index.
    */
    user = await User.get({name: 'Road Runner'}, {index: 'gs1', follow: true})

    /*
        Fetch users for account. Uses accountId from context
    */
    let users = await User.find({})

    /*
        Add a filter expression to find only those users that have an admin role.
    */
    let adminUsers = await User.find({role: 'admin'})

    /*
        Simple update
    */
    user = await User.update({email: 'roadrunner@acme.com', balance: 0, role: 'admin'})

    /*
        Update a nested field
    */
    user = await User.update({email: 'roadrunner@acme.com'}, {set: {'address.zip': '{"98034"}'}})

    /*
        Different ways to update properties. Add will atomically add 10 to the balance as will the `set` expression.
    */
    user = await User.update({email: 'roadrunner@acme.com', balance: 110})
    user = await User.update({email: 'roadrunner@acme.com'}, {add: {balance: 10}})
    user = await User.update({email: 'roadrunner@acme.com'}, {set: {balance: '${balance} - {2}'}})

    //  Find users with a balance over $100
    users = await User.find({accountId: account.id}, {
        where: '${balance} > {100}'
    })

    /*
        Get a collection of items in the account. (See below table.fetch is simpler)
     */
    let collection = await table.fetch(['Account', 'User', 'Invoice'], {pk: `account#${account.id}`})

    /*
        Create many users via batch
     */
    let batch = {}
    let i = 0, count = 0
    while (i++ < 200) {
        User.create({name: `user${i}`, email: `user${i}@acme.com`}, {batch})
        if (++count >= 25) {
            await table.batchWrite(batch)
            batch = {}
            count = 0
        }
    }

    /*
        Get a list of user email addresses. Need _type to know how to parse results.
    */
    let items = (await User.find({}, {fields: ['email', '_type']})).map(i => i.email)

    /*
        Read a page of users in groups of 25 at a time
     */
    let start
    do {
        users = await User.find({}, {start, limit: 25})
        start = users.start
    } while (users.start)

    /*
        Create a product, not tied to an account.
    */
    let product = await Product.create({name: 'rocket', price: 10.99 })

    /*
        Transaction to atomically create an invoice and update the user and account balance
    */
    let transaction = {}
    Invoice.create({product: product.name, count: 1, total: product.price}, {transaction})
    User.update({email: 'roadrunner@acme.com'}, {add: {balance: product.price}, transaction})
    Account.update({id: account.id}, {add: {balance: product.price}, transaction})
    let result = await table.transact('write', transaction)

    /*
        Fetch item collection of entities in the account
    */
    collection = await table.fetch(['Account', 'User', 'Invoice'], {pk: `account#${account.id}`})

    /*
        Get invoices for the account this month. The sk is of the form invoice#iso-date#id
        So we take advantage of the fact that ISO dates sort.
    */
    let from = new Date()
    from.setMonth(from.getMonth() - 1)
    let invoices = await Invoice.find({gs1sk: {
        between: [`invoice#${from.toISOString()}`, `invoice#${new Date().toISOString()}`]}
    }, {index: 'gs1', follow: true})

    /*
        For maintenance, useful to be able to query by entity type. This is not a costly scan.
    */
    let accounts = await Account.find({}, {index: 'gs1'})
    users = await User.find({}, {index: 'gs1'})
    invoices = await Invoice.find({}, {index: 'gs1'})

    /*
        Cleanup
    */
    await table.deleteTable('DeleteTableForever')
}

//  Short nap
async function delay(time) {
    return new Promise(function(resolve, reject) {
        setTimeout(() => resolve(true), time)
    })
}

async function main() {
    await start()
    try {
        await test()
    } catch (err) {
        console.error(err)
    }
    await stop()
}

//  Ah, if only for a top-level await
main()
