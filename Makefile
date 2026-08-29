.PHONY: db migrate seed notification-migrate notification-service

db:
	docker compose up -d postgres rabbitmq mailhog

migrate:
	pnpm --dir seat-booking-server migrate

seed:
	pnpm --dir seat-booking-server seed

notification-migrate:
	pnpm --dir notification-service migrate

notification-service:
	pnpm --dir notification-service dev
