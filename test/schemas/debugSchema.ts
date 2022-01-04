/*
    Fully speced schema
 */
export default {
    version: '0.0.1',
    indexes: {
        primary: { hash: 'pk', sort: 'sk' },
        gs1: { hash: 'gs1pk', sort: 'gs1sk', project: 'all' },
    },
    models: {
        User: {
            pk:          { type: String, value: '${_type}#' },
            sk:          { type: String, value: '${_type}#${domain}#${id}' },

            gs1pk:       { type: String, value: '${_type}#' },
            gs1sk:       { type: String, value: '${_type}#${id}' },

            name:        { type: String },
            email:       { type: String },
            id:          { type: String, uuid: "uuid" },
            domain:      { type: String },
            nested:      { type: Object, schema: {
                seq:     { type: String, uuid: "uuid" },
            }}
        }
    }
}
