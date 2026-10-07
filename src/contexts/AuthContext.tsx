'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

export interface UserProfile {
  id: string
  email: string
  name: string
  role: 'admin' | 'employee'
  avatar?: string
}

interface SignUpMetadata {
  name: string
  role?: 'admin' | 'employee'
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, metadata: SignUpMetadata) => Promise<{ needEmailConfirm: boolean }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const syncProfile = async (currentUser: User) => {
    try {
      // 1. Try to fetch existing profile from 'users' table
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle()

      if (data) {
        setProfile(data)
        return
      }

      // 2. If no profile exists yet, create one from auth metadata
      const userMeta = currentUser.user_metadata || {}
      const fallbackName = userMeta.name || currentUser.email?.split('@')[0] || 'User'
      const fallbackRole = (userMeta.role as 'admin' | 'employee') || 'employee'

      const newProfile: UserProfile = {
        id: currentUser.id,
        email: currentUser.email || '',
        name: fallbackName,
        role: fallbackRole,
      }

      await supabase.from('users').upsert({
        id: newProfile.id,
        email: newProfile.email,
        name: newProfile.name,
        role: newProfile.role,
        is_active: true,
        updated_at: new Date().toISOString(),
      })

      setProfile(newProfile)
    } catch (err) {
      console.warn('[AuthContext] Profile sync error:', err)
      // Fallback in-memory profile
      const userMeta = currentUser.user_metadata || {}
      setProfile({
        id: currentUser.id,
        email: currentUser.email || '',
        name: userMeta.name || currentUser.email?.split('@')[0] || 'User',
        role: (userMeta.role as 'admin' | 'employee') || 'employee',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Check initial active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        syncProfile(session.user)
      } else {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        syncProfile(session.user)
      } else {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw error
    if (data.user) {
      setUser(data.user)
      await syncProfile(data.user)
    }
  }

  const signUp = async (
    email: string,
    password: string,
    metadata: SignUpMetadata
  ): Promise<{ needEmailConfirm: boolean }> => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          name: metadata.name.trim(),
          role: metadata.role || 'employee',
        },
      },
    })

    if (error) throw error

    if (data.user) {
      // Create user record in 'users' table
      const profileToCreate = {
        id: data.user.id,
        email: data.user.email || email.trim(),
        name: metadata.name.trim(),
        role: metadata.role || 'employee',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      await supabase.from('users').upsert(profileToCreate)

      if (data.session) {
        setUser(data.user)
        setProfile(profileToCreate)
        return { needEmailConfirm: false }
      }
      return { needEmailConfirm: true }
    }

    return { needEmailConfirm: false }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
