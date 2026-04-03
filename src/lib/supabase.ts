import { createClient, type User } from '@supabase/supabase-js';
import { compressImage } from './imageCompression';

export const PRIMARY_ADMIN_EMAIL = 'nopanat.aplus@gmail.com';
export const PRIMARY_ADMIN_UUID = 'e58d7131-8935-4093-b27d-042ab1e8c49d';

export type TicketStatus = 'Pending' | 'Approved' | 'Completed' | 'Rejected';

export type TicketRecord = {
  dbId: string;
  ticketId: string;
  fullName: string;
  department: string;
  productionLine: string;
  otherDepartment: string;
  suggestionType: string;
  detail: string;
  cause: string;
  problem: string;
  solution: string;
  beforeImages: string[];
  afterImages: string[];
  status: TicketStatus;
  managerFeedback: string;
  afterDetail: string;
  createdAt: string;
};

export type TicketInsertInput = {
  ticketId: string;
  fullName: string;
  department: string;
  productionLine: string;
  otherDepartment: string;
  suggestionType: string;
  detail: string;
  cause: string;
  problem: string;
  solution: string;
  beforeImages: string[];
  afterImages: string[];
};

type TicketRow = {
  id: string;
  ticket_id: string;
  full_name: string;
  department: string;
  production_line: string | null;
  other_department: string | null;
  suggestion_type: string;
  detail: string;
  cause: string;
  problem: string;
  solution: string;
  before_images: string[] | null;
  after_images: string[] | null;
  status: TicketStatus;
  manager_feedback: string | null;
  after_detail: string | null;
  created_at: string;
};

type TicketUpdateInput = {
  status: TicketStatus;
  managerFeedback: string;
  afterDetail: string;
  afterImages: string[];
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }

  return supabase;
}

function mapTicketRow(row: TicketRow): TicketRecord {
  return {
    dbId: row.id,
    ticketId: row.ticket_id,
    fullName: row.full_name,
    department: row.department,
    productionLine: row.production_line || '',
    otherDepartment: row.other_department || '',
    suggestionType: row.suggestion_type,
    detail: row.detail,
    cause: row.cause,
    problem: row.problem,
    solution: row.solution,
    beforeImages: row.before_images || [],
    afterImages: row.after_images || [],
    status: row.status,
    managerFeedback: row.manager_feedback || '',
    afterDetail: row.after_detail || '',
    createdAt: row.created_at,
  };
}

export async function uploadImages(files: File[], ticketId: string, prefix: string): Promise<string[]> {
  const client = requireSupabase();
  const urls: string[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const compressed = await compressImage(files[index]);
    const extension = compressed.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${ticketId}/${prefix}_${Date.now()}_${index}.${extension}`;

    const { error } = await client.storage.from('tickets').upload(path, compressed, {
      contentType: compressed.type,
      upsert: false,
    });

    if (error) {
      throw error;
    }

    const { data } = client.storage.from('tickets').getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}

export async function createTicket(input: TicketInsertInput) {
  const client = requireSupabase();
  const { error } = await client.from('tickets').insert({
    ticket_id: input.ticketId,
    full_name: input.fullName,
    department: input.department,
    production_line: input.productionLine,
    other_department: input.otherDepartment,
    suggestion_type: input.suggestionType,
    detail: input.detail,
    cause: input.cause,
    problem: input.problem,
    solution: input.solution,
    before_images: input.beforeImages,
    after_images: input.afterImages,
    status: 'Pending',
    manager_feedback: '',
    after_detail: '',
  });

  if (error) {
    throw error;
  }
}

export async function fetchTickets(): Promise<TicketRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('tickets')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => mapTicketRow(row as TicketRow));
}

export async function updateTicket(ticketId: string, input: TicketUpdateInput) {
  const client = requireSupabase();
  const { error } = await client
    .from('tickets')
    .update({
      status: input.status,
      manager_feedback: input.managerFeedback,
      after_detail: input.afterDetail,
      after_images: input.afterImages,
    })
    .eq('id', ticketId);

  if (error) {
    throw error;
  }
}

export async function signInAdmin(email: string, password: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw error;
  }

  return data.user;
}

export async function signOutAdmin() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function getCurrentAdminUser(): Promise<User | null> {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session?.user ?? null;
}

export function subscribeToAdminAuthState(callback: (user: User | null) => void) {
  const client = requireSupabase();
  return client.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}

export function isPrimaryAdmin(user: Pick<User, 'id' | 'email'> | null) {
  return (
    user?.id === PRIMARY_ADMIN_UUID ||
    user?.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL
  );
}
