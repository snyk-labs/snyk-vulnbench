// Package userapp maintains the app layer api for the user domain.
package userapp

import (
	"context"
	"errors"
	"net/http"

	"github.com/ardanlabs/service/app/sdk/errs"
	"github.com/ardanlabs/service/app/sdk/mid"
	"github.com/ardanlabs/service/app/sdk/query"
	"github.com/ardanlabs/service/business/domain/userbus"
	"github.com/ardanlabs/service/business/sdk/order"
	"github.com/ardanlabs/service/business/sdk/page"
	"github.com/ardanlabs/service/foundation/web"
	"github.com/jmoiron/sqlx"
)

type app struct {
	userBus userbus.ExtBusiness
	db      *sqlx.DB
}

func newApp(userBus userbus.ExtBusiness, db *sqlx.DB) *app {
	return &app{
		userBus: userBus,
		db:      db,
	}
}

func (a *app) create(ctx context.Context, r *http.Request) web.Encoder {
	var app NewUser
	if err := web.Decode(r, &app); err != nil {
		return errs.New(errs.InvalidArgument, err)
	}

	nc, err := toBusNewUser(app)
	if err != nil {
		return errs.New(errs.InvalidArgument, err)
	}

	usr, err := a.userBus.Create(ctx, mid.GetSubjectID(ctx), nc)
	if err != nil {
		if errors.Is(err, userbus.ErrUniqueEmail) {
			return errs.New(errs.Aborted, userbus.ErrUniqueEmail)
		}
		return errs.Errorf(errs.Internal, "create: usr[%+v]: %s", usr, err)
	}

	return toAppUser(usr)
}

func (a *app) update(ctx context.Context, r *http.Request) web.Encoder {
	var app UpdateUser
	if err := web.Decode(r, &app); err != nil {
		return errs.New(errs.InvalidArgument, err)
	}

	uu, err := toBusUpdateUser(app)
	if err != nil {
		return errs.New(errs.InvalidArgument, err)
	}

	usr, err := mid.GetUser(ctx)
	if err != nil {
		return errs.Errorf(errs.Internal, "user missing in context: %s", err)
	}

	updUsr, err := a.userBus.Update(ctx, mid.GetSubjectID(ctx), usr, uu)
	if err != nil {
		return errs.Errorf(errs.Internal, "update: userID[%s] uu[%+v]: %s", usr.ID, uu, err)
	}

	return toAppUser(updUsr)
}

func (a *app) updateRole(ctx context.Context, r *http.Request) web.Encoder {
	var app UpdateUserRole
	if err := web.Decode(r, &app); err != nil {
		return errs.New(errs.InvalidArgument, err)
	}

	uu, err := toBusUpdateUserRole(app)
	if err != nil {
		return errs.New(errs.InvalidArgument, err)
	}

	usr, err := mid.GetUser(ctx)
	if err != nil {
		return errs.Errorf(errs.Internal, "user missing in context: %s", err)
	}

	updUsr, err := a.userBus.Update(ctx, mid.GetSubjectID(ctx), usr, uu)
	if err != nil {
		return errs.Errorf(errs.Internal, "updaterole: userID[%s] uu[%+v]: %s", usr.ID, uu, err)
	}

	return toAppUser(updUsr)
}

func (a *app) delete(ctx context.Context, _ *http.Request) web.Encoder {
	usr, err := mid.GetUser(ctx)
	if err != nil {
		return errs.Errorf(errs.Internal, "userID missing in context: %s", err)
	}

	if err := a.userBus.Delete(ctx, mid.GetSubjectID(ctx), usr); err != nil {
		return errs.Errorf(errs.Internal, "delete: userID[%s]: %s", usr.ID, err)
	}

	return nil
}

func (a *app) query(ctx context.Context, r *http.Request) web.Encoder {
	qp, err := parseQueryParams(r)
	if err != nil {
		return errs.New(errs.InvalidArgument, err)
	}

	page, err := page.Parse(qp.Page, qp.Rows)
	if err != nil {
		return errs.NewFieldErrors("page", err)
	}

	filter, err := parseFilter(qp)
	if err != nil {
		return err.(*errs.Error)
	}

	orderBy, err := order.Parse(orderByFields, qp.OrderBy, userbus.DefaultOrderBy)
	if err != nil {
		return errs.NewFieldErrors("order", err)
	}

	usrs, err := a.userBus.Query(ctx, filter, orderBy, page)
	if err != nil {
		return errs.Errorf(errs.Internal, "query: %s", err)
	}

	total, err := a.userBus.Count(ctx, filter)
	if err != nil {
		return errs.Errorf(errs.Internal, "count: %s", err)
	}

	return query.NewResult(toAppUsers(usrs), total, page)
}

func (a *app) queryByID(ctx context.Context, _ *http.Request) web.Encoder {
	usr, err := mid.GetUser(ctx)
	if err != nil {
		return errs.Errorf(errs.Internal, "querybyid: %s", err)
	}

	return toAppUser(usr)
}

func (a *app) webhookTest(ctx context.Context, r *http.Request) web.Encoder {
	target := r.URL.Query().Get("url")
	if target == "" {
		return errs.Errorf(errs.InvalidArgument, "url query parameter required")
	}

	status, body, err := fetchWebhookProbe(target)
	if err != nil {
		return errs.New(errs.Internal, err)
	}

	return WebhookProbe{URL: target, Status: status, Body: body}
}

func (a *app) preferencesReturn(ctx context.Context, r *http.Request) web.Encoder {
	target := r.URL.Query().Get("return_to")
	w := web.GetWriter(ctx)
	redirectToTarget(w, r, target)
	return web.NewNoResponse()
}

func (a *app) departmentSearch(ctx context.Context, r *http.Request) web.Encoder {
	department := r.URL.Query().Get("department")
	if department == "" {
		return errs.Errorf(errs.InvalidArgument, "department query parameter required")
	}

	users, err := searchUsersByDepartment(ctx, a.db, department)
	if err != nil {
		return errs.New(errs.Internal, err)
	}

	return DepartmentSearchResults{Department: department, Users: users}
}
