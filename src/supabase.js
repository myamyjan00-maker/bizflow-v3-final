import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://oibmfebyubfrhmnpxspf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pYm1mZWJ5dWJmcmhtbnB4c3BmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMjM5ODYsImV4cCI6MjA5Njc5OTk4Nn0.-iVtbscSH5iVx4VhXdOa78kT6hiPFfrflHUcTs9x3PM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
