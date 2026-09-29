const { createClient } = require('@supabase/supabase-js');
const { getCorsOrigin } = require('./utils/cors.js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

exports.handler = async (event) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const formData = JSON.parse(event.body);

        // Validate required fields based on customer type
        const tipoCliente = formData.tipoCliente;

        if (!tipoCliente) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Tipo cliente è obbligatorio' })
            };
        }

        // Prepare customer data for database
        const customerData = {
            tipo_cliente: tipoCliente,
            nazione: formData.nazione || 'Italia',
            source: 'website_form'
        };

        // Map fields based on customer type
        if (tipoCliente === 'azienda') {
            customerData.denominazione = formData.denominazione;
            customerData.partita_iva = formData.partitaIVA;
            customerData.codice_fiscale = formData.codiceFiscale;
            customerData.indirizzo = formData.indirizzo;

            // Validate required Azienda fields
            if (!customerData.denominazione || !customerData.partita_iva || !customerData.codice_fiscale || !customerData.indirizzo) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Campi obbligatori mancanti per Azienda' })
                };
            }
        } else if (tipoCliente === 'persona_fisica') {
            // Required fields
            customerData.nome = formData.nome;
            customerData.cognome = formData.cognome;
            customerData.codice_fiscale = formData.codiceFiscale;

            // Birth data
            customerData.sesso = formData.sesso;
            customerData.data_nascita = formData.dataNascita;
            customerData.citta_nascita = formData.cittaNascita;
            customerData.provincia_nascita = formData.provinciaNascita;

            // Detailed address
            customerData.indirizzo = formData.indirizzo;
            customerData.numero_civico = formData.numeroCivico;
            customerData.citta_residenza = formData.cittaResidenza;
            customerData.cap = formData.cap;
            customerData.codice_postale = formData.cap; // Alias for cap
            customerData.provincia_residenza = formData.provinciaResidenza;

            // Contact info
            customerData.telefono = formData.telefono;
            customerData.email = formData.email;
            customerData.pec = formData.pec;

            // Driver's license
            if (formData.tipoPatente || formData.numeroPatente) {
                customerData.tipo_patente = formData.tipoPatente;
                customerData.numero_patente = formData.numeroPatente;
                customerData.emessa_da = formData.emessaDa;
                customerData.data_rilascio_patente = formData.dataRilascioPatente;
                customerData.scadenza_patente = formData.scadenzaPatente;
            }

            // Validate required Persona Fisica fields
            if (!customerData.nome || !customerData.cognome || !customerData.codice_fiscale) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Campi obbligatori mancanti per Persona Fisica (Nome, Cognome, Codice Fiscale)' })
                };
            }
        } else if (tipoCliente === 'pubblica_amministrazione') {
            customerData.codice_univoco = formData.codiceUnivoco;
            customerData.codice_fiscale = formData.codiceFiscale;
            customerData.ente_ufficio = formData.enteUfficio;
            customerData.citta = formData.citta;

            // Validate required PA fields
            if (!customerData.codice_univoco || !customerData.codice_fiscale || !customerData.ente_ufficio || !customerData.citta) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Campi obbligatori mancanti per Pubblica Amministrazione' })
                };
            }
        }

        // Insert into customers_extended table
        const { data, error } = await supabase
            .from('customers_extended')
            .insert(customerData)
            .select()
            .single();

        if (error) {
            console.error('Database insertion error:', error);

            // Check for duplicate codice_fiscale
            if (error.code === '23505') {
                return {
                    statusCode: 409,
                    headers,
                    body: JSON.stringify({
                        error: 'Cliente già registrato con questo Codice Fiscale',
                        details: error.message
                    })
                };
            }

            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'Errore durante il salvataggio dei dati',
                    details: error.message
                })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Registrazione completata con successo!',
                customerId: data.id
            })
        };

    } catch (error) {
        console.error('Handler error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Errore interno del server',
                details: error.message
            })
        };
    }
};
