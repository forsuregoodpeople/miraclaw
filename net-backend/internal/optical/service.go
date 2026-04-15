package optical

import (
	"context"
	"fmt"
)

type Service interface {
	// OLT
	ListOLT(ctx context.Context) ([]Device, error)
	GetDevice(ctx context.Context, id int) (*Device, error)
	CreateDevice(ctx context.Context, d *Device) (*Device, error)
	UpdateDevice(ctx context.Context, id int, d *Device) (*Device, error)
	DeleteDevice(ctx context.Context, id int) error

	// ODP
	ListODP(ctx context.Context) ([]ODPSummary, error)
	AdjustODPPorts(ctx context.Context, odpID int, delta int) error

	// ONU
	ListONU(ctx context.Context) ([]Device, error)
	GetStatusHistory(ctx context.Context, deviceID int, limit int) ([]Status, error)

	// GenieACS
	ListGenieACSDevices(ctx context.Context) ([]map[string]interface{}, error)
	GetGenieACSDevice(ctx context.Context, genieacsID string) (map[string]interface{}, error)

	// Alerts
	ListActiveAlerts(ctx context.Context) ([]Alert, error)
	ResolveAlert(ctx context.Context, alertID int) error

	// GenieACS settings
	GetGenieACSSettings(ctx context.Context) (GenieACSSettings, error)
	UpdateGenieACSSettings(ctx context.Context, s GenieACSSettings) error

	// FiberCable CRUD
	ListFiberCables(ctx context.Context) ([]FiberCable, error)
	CreateFiberCable(ctx context.Context, c *FiberCable) (*FiberCable, error)
	UpdateFiberCable(ctx context.Context, id int, c *FiberCable) (*FiberCable, error)
	DeleteFiberCable(ctx context.Context, id int) error
}

type service struct {
	repo      Repository
	acsClient *GenieACSClient
}

func NewService(repo Repository, acsClient *GenieACSClient) Service {
	return &service{repo: repo, acsClient: acsClient}
}

func (s *service) ListOLT(ctx context.Context) ([]Device, error) {
	devices, err := s.repo.FindAllByType(ctx, DeviceTypeOLT)
	if err != nil {
		return nil, err
	}
	if devices == nil {
		devices = []Device{}
	}
	return devices, nil
}

func (s *service) GetDevice(ctx context.Context, id int) (*Device, error) {
	d, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if d == nil {
		return nil, nil
	}
	// Attach latest status if available
	status, err := s.repo.FindLatestStatusByDeviceID(ctx, id)
	if err == nil && status != nil {
		d.LatestStatus = status
	}
	return d, nil
}

func (s *service) CreateDevice(ctx context.Context, d *Device) (*Device, error) {
	if d.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if d.DeviceType != DeviceTypeOLT && d.DeviceType != DeviceTypeODP && d.DeviceType != DeviceTypeONU {
		return nil, fmt.Errorf("device_type must be olt, odp, or onu")
	}
	d.IsActive = true
	if err := s.repo.Create(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *service) UpdateDevice(ctx context.Context, id int, d *Device) (*Device, error) {
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, nil
	}
	d.ID = id
	d.DeviceType = existing.DeviceType // type cannot change after creation
	if err := s.repo.Update(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *service) DeleteDevice(ctx context.Context, id int) error {
	return s.repo.Delete(ctx, id)
}

func (s *service) AdjustODPPorts(ctx context.Context, odpID int, delta int) error {
	existing, err := s.repo.FindByID(ctx, odpID)
	if err != nil {
		return err
	}
	if existing == nil || existing.DeviceType != DeviceTypeODP {
		return fmt.Errorf("ODP tidak ditemukan")
	}
	if existing.TotalPorts != nil {
		newUsed := existing.UsedPorts + delta
		if newUsed < 0 {
			newUsed = 0
		}
		if newUsed > *existing.TotalPorts {
			return fmt.Errorf("port melebihi kapasitas: total %d, digunakan %d", *existing.TotalPorts, newUsed)
		}
	}
	return s.repo.UpdateODPUsedPorts(ctx, odpID, delta)
}

func (s *service) ListODP(ctx context.Context) ([]ODPSummary, error) {
	summaries, err := s.repo.FindODPSummaries(ctx)
	if err != nil {
		return nil, err
	}
	if summaries == nil {
		summaries = []ODPSummary{}
	}
	return summaries, nil
}

func (s *service) ListONU(ctx context.Context) ([]Device, error) {
	devices, err := s.repo.FindAllByType(ctx, DeviceTypeONU)
	if err != nil {
		return nil, err
	}
	if devices == nil {
		devices = []Device{}
	}
	// Attach latest status to each ONU
	for i := range devices {
		status, err := s.repo.FindLatestStatusByDeviceID(ctx, devices[i].ID)
		if err == nil && status != nil {
			devices[i].LatestStatus = status
		}
	}
	return devices, nil
}

func (s *service) GetStatusHistory(ctx context.Context, deviceID int, limit int) ([]Status, error) {
	statuses, err := s.repo.FindStatusHistory(ctx, deviceID, limit)
	if err != nil {
		return nil, err
	}
	if statuses == nil {
		statuses = []Status{}
	}
	return statuses, nil
}

func (s *service) ListGenieACSDevices(ctx context.Context) ([]map[string]interface{}, error) {
	projection := "_id,_lastInform,_deviceId" +
		",InternetGatewayDevice.X_ZTE_COM_GponParm.RxOpticalPower" +
		",InternetGatewayDevice.X_ZTE_COM_GponParm.TxOpticalPower" +
		",InternetGatewayDevice.WANDevice.1.X_HW_GPON.RxPower" +
		",InternetGatewayDevice.WANDevice.1.X_HW_GPON.TxPower" +
		",InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.MACAddress" +
		",InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress" +
		",InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress" +
		",InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username" +
		",InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID" +
		",InternetGatewayDevice.DeviceInfo.X_HW_Temperature" +
		",InternetGatewayDevice.X_ZTE_COM_TempInfo.Temperature" +
		",InternetGatewayDevice.LANDevice.1.Hosts.Host"
	devices, err := s.acsClient.ListDevices(ctx, projection)
	if err != nil {
		return nil, err
	}
	if devices == nil {
		devices = []map[string]interface{}{}
	}
	return devices, nil
}

func (s *service) GetGenieACSDevice(ctx context.Context, genieacsID string) (map[string]interface{}, error) {
	return s.acsClient.FetchDeviceParameters(ctx, genieacsID, "")
}

func (s *service) ListActiveAlerts(ctx context.Context) ([]Alert, error) {
	alerts, err := s.repo.FindActiveAlerts(ctx)
	if err != nil {
		return nil, err
	}
	if alerts == nil {
		alerts = []Alert{}
	}
	return alerts, nil
}

func (s *service) ResolveAlert(ctx context.Context, alertID int) error {
	return s.repo.ResolveAlert(ctx, alertID)
}

func (s *service) GetGenieACSSettings(ctx context.Context) (GenieACSSettings, error) {
	url, _ := s.repo.GetSetting(ctx, "genieacs.url")
	username, _ := s.repo.GetSetting(ctx, "genieacs.username")
	return GenieACSSettings{URL: url, Username: username}, nil
}

func (s *service) ListFiberCables(ctx context.Context) ([]FiberCable, error) {
	cables, err := s.repo.ListFiberCables(ctx)
	if err != nil {
		return nil, err
	}
	if cables == nil {
		cables = []FiberCable{}
	}
	return cables, nil
}

func (s *service) CreateFiberCable(ctx context.Context, c *FiberCable) (*FiberCable, error) {
	if c.CableType == "" {
		c.CableType = "fiber"
	}
	if c.Color == "" {
		c.Color = "#f97316"
	}
	return s.repo.CreateFiberCable(ctx, c)
}

func (s *service) UpdateFiberCable(ctx context.Context, id int, c *FiberCable) (*FiberCable, error) {
	return s.repo.UpdateFiberCable(ctx, id, c)
}

func (s *service) DeleteFiberCable(ctx context.Context, id int) error {
	return s.repo.DeleteFiberCable(ctx, id)
}

func (s *service) UpdateGenieACSSettings(ctx context.Context, settings GenieACSSettings) error {
	if err := s.repo.SetSetting(ctx, "genieacs.url", settings.URL); err != nil {
		return err
	}
	if err := s.repo.SetSetting(ctx, "genieacs.username", settings.Username); err != nil {
		return err
	}
	if settings.Password != "" {
		if err := s.repo.SetSetting(ctx, "genieacs.password", settings.Password); err != nil {
			return err
		}
	}
	// Apply to live client
	password, _ := s.repo.GetSetting(ctx, "genieacs.password")
	s.acsClient.UpdateConfig(GenieACSConfig{
		BaseURL:  settings.URL,
		Username: settings.Username,
		Password: password,
	})
	return nil
}
