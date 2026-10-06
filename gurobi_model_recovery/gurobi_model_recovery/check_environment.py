"""Local dependency and Gurobi-license smoke check. Does not use Modeler."""
import importlib
import sys


def main():
    print('Python:', sys.version.split()[0])
    print('Executable:', sys.executable)
    missing = []
    for name in ('numpy', 'pandas', 'scipy', 'pytest', 'gurobipy'):
        try:
            module = importlib.import_module(name)
            version = getattr(module, '__version__', 'installed')
            print(f'[OK] {name}: {version}')
        except ImportError:
            print(f'[BLOCKED] {name}: not installed')
            missing.append(name)
    if missing:
        print('Install requirements.txt in this folder, then run this check again.')
        return 2
    import gurobipy as gp
    try:
        with gp.Env(empty=True) as env:
            env.setParam('OutputFlag', 0)
            env.start()
            with gp.Model('environment_smoke_test', env=env) as model:
                model.Params.OutputFlag = 0
                x = model.addVar(lb=0.0, ub=1.0)
                model.setObjective(x, gp.GRB.MAXIMIZE)
                model.optimize()
                if model.Status != gp.GRB.OPTIMAL or abs(model.ObjVal-1.0) > 1e-6:
                    print('[FAILED] Gurobi smoke-test solution is unexpected:', model.Status)
                    return 1
        print('[PASS] Local Gurobi solver ran a one-variable test.')
        print('A passed smoke test is NOT a production-license or model-validation certificate.')
        return 0
    except gp.GurobiError as exc:
        print('[BLOCKED] Gurobi license/environment:', exc)
        print('Do not share license files, passwords, API tokens, or WLS secrets.')
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
