package domain

import (
	"context"
	"fmt"
)

type MockUserRepository struct {
	Profiles    map[string]*Profile
	Medications map[string]*Medication
	DoctorPacks map[string]*DoctorPack
}

func NewMockUserRepository() *MockUserRepository {
	return &MockUserRepository{
		Profiles:    make(map[string]*Profile),
		Medications: make(map[string]*Medication),
		DoctorPacks: make(map[string]*DoctorPack),
	}
}

func (m *MockUserRepository) GetProfile(ctx context.Context, id string) (*Profile, error) {
	return m.Profiles[id], nil
}

func (m *MockUserRepository) CreateProfile(ctx context.Context, profile *Profile) error {
	m.Profiles[profile.ID] = profile
	return nil
}

func (m *MockUserRepository) UpdateProfile(ctx context.Context, profile *Profile) error {
	m.Profiles[profile.ID] = profile
	return nil
}

func (m *MockUserRepository) GetMedications(ctx context.Context, userID string) ([]*Medication, error) {
	var res []*Medication
	for _, med := range m.Medications {
		if med.UserID == userID {
			res = append(res, med)
		}
	}
	return res, nil
}

func (m *MockUserRepository) GetMedication(ctx context.Context, id string, userID string) (*Medication, error) {
	med, ok := m.Medications[id]
	if !ok || med.UserID != userID {
		return nil, nil
	}
	return med, nil
}

func (m *MockUserRepository) CreateMedication(ctx context.Context, med *Medication) error {
	m.Medications[med.ID] = med
	return nil
}

func (m *MockUserRepository) UpdateMedication(ctx context.Context, med *Medication) error {
	m.Medications[med.ID] = med
	return nil
}

func (m *MockUserRepository) DeleteMedication(ctx context.Context, id string, userID string) error {
	med, ok := m.Medications[id]
	if !ok || med.UserID != userID {
		return fmt.Errorf("sql: no rows in result set")
	}
	delete(m.Medications, id)
	return nil
}

func (m *MockUserRepository) CreateDoctorPack(ctx context.Context, pack *DoctorPack) error {
	m.DoctorPacks[pack.ID] = pack
	return nil
}

func (m *MockUserRepository) UpdateDoctorPack(ctx context.Context, pack *DoctorPack) error {
	m.DoctorPacks[pack.ID] = pack
	return nil
}

func (m *MockUserRepository) GetLatestDoctorPack(ctx context.Context, userID string) (*DoctorPack, error) {
	var latest *DoctorPack
	for _, p := range m.DoctorPacks {
		if p.UserID == userID {
			if latest == nil || p.CreatedAt.After(latest.CreatedAt) {
				latest = p
			}
		}
	}
	return latest, nil
}
